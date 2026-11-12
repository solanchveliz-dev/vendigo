package auth

import (
	"context"
	"database/sql"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/cuentas"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// ---------- verificación en dos pasos desde Configuración (vendedoras) ----------

func (m *Modulo) estadoMFA(w http.ResponseWriter, r *http.Request) error {
	u, _ := httpx.UsuarioDe(r.Context())
	var activo bool
	var respaldo []string
	var metodo, celular string
	if err := m.app.DB.QueryRowContext(r.Context(), `SELECT totp_activo, totp_respaldo, mfa_metodo, celular FROM usuarios WHERE id=$1`, u.ID).
		Scan(&activo, pq.Array(&respaldo), &metodo, &celular); err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"activo": activo, "metodo": metodo, "respaldo_restantes": len(respaldo), "obligatoria": u.Rol == "admin", "celular": cuentas.Ocultar(celular)})
	return nil
}

func (m *Modulo) iniciarMFA(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	var activo bool
	var cuenta string
	m.app.DB.QueryRowContext(ctx, `SELECT totp_activo, COALESCE(NULLIF(email,''), celular) FROM usuarios WHERE id=$1`, u.ID).Scan(&activo, &cuenta)
	if activo {
		return httpx.Conflicto("mfa_activa", "Ya tienes activa la verificación en dos pasos.")
	}
	sec := seguridad.NuevoSecretoTOTP()
	c, err := m.app.Cifrador.Cifrar(sec)
	if err != nil {
		return err
	}
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_pendiente_cifrado=$2 WHERE id=$1`, u.ID, c); err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"secreto": sec, "otpauth_url": seguridad.URLTOTP(emisorTOTP, cuenta, sec)})
	return nil
}

func (m *Modulo) activarMFA(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	var in struct {
		Codigo string `json:"codigo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	var pendiente *string
	m.app.DB.QueryRowContext(ctx, `SELECT totp_pendiente_cifrado FROM usuarios WHERE id=$1`, u.ID).Scan(&pendiente)
	if pendiente == nil {
		return httpx.Invalido("Vuelve a empezar: escanea el código QR otra vez.")
	}
	sec, err := m.app.Cifrador.Descifrar(*pendiente)
	if err != nil {
		return err
	}
	paso, ok := seguridad.VerificarTOTP(sec, strings.TrimSpace(in.Codigo), time.Now())
	if !ok {
		return httpx.Invalido("El código no es correcto. Revisa que la hora de tu celular esté bien y usa el código actual.")
	}
	codigos, huellas := seguridad.NuevosRespaldos()
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_secreto_cifrado=totp_pendiente_cifrado, totp_pendiente_cifrado=NULL,
		totp_activo=true, mfa_metodo='app', totp_ultimo_paso=$2, totp_respaldo=$3 WHERE id=$1`, u.ID, paso, pq.Array(huellas)); err != nil {
		return err
	}
	m.app.Auditar(ctx, m.app.DB, u.ID, "activar_mfa", "usuario", u.ID, nil)
	avisoSeguridad(ctx, m.app.DB, u.ID, "Activaste la verificación en dos pasos", "Desde ahora, al ingresar te pediremos el código de tu app de autenticación.")
	httpx.OK(w, map[string]any{"codigos_respaldo": codigos})
	return nil
}

func (m *Modulo) desactivarMFA(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	if u.Rol == "admin" {
		return httpx.NuevoError(http.StatusForbidden, "mfa_obligatoria", "Para administradores la verificación en dos pasos es obligatoria.")
	}
	var in struct {
		Password string `json:"password"`
		Codigo   string `json:"codigo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	var hash string
	m.app.DB.QueryRowContext(ctx, `SELECT password_hash FROM usuarios WHERE id=$1`, u.ID).Scan(&hash)
	if !seguridad.VerificarPassword(in.Password, hash) {
		return httpx.Invalido("Tu contraseña no es correcta.")
	}
	if err := m.ConfirmarPaso(ctx, u.ID, in.Codigo); err != nil {
		return err
	}
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_activo=false, mfa_metodo='app', totp_secreto_cifrado=NULL, totp_respaldo='{}', totp_ultimo_paso=0 WHERE id=$1`, u.ID); err != nil {
		return err
	}
	m.app.Auditar(ctx, m.app.DB, u.ID, "desactivar_mfa", "usuario", u.ID, nil)
	avisoSeguridad(ctx, m.app.DB, u.ID, "Desactivaste la verificación en dos pasos", "Si no fuiste tú, cambia tu contraseña de inmediato.")
	httpx.OK(w, map[string]string{"mensaje": "Desactivaste la verificación en dos pasos."})
	return nil
}

// ---------- confirmar que es la persona antes de algo delicado ----------

// ConfirmarPaso valida el código antes de una acción delicada: el de la app de autenticación
// (o un código de respaldo) si la tiene activa; si no, el que se le envió por SMS.
func (m *Modulo) ConfirmarPaso(ctx context.Context, usuarioID, codigo string) error {
	codigo = seguridad.NormalizarCodigo(codigo)
	if codigo == "" {
		return httpx.NuevoError(http.StatusForbidden, "confirmacion_requerida", "Por seguridad, confirma que eres tú con un código.")
	}
	var activo bool
	var cifrado *string
	var ultimo int64
	var respaldo []string
	var celular, metodo string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT totp_activo, totp_secreto_cifrado, totp_ultimo_paso, totp_respaldo, celular, mfa_metodo FROM usuarios WHERE id=$1`, usuarioID).
		Scan(&activo, &cifrado, &ultimo, pq.Array(&respaldo), &celular, &metodo); err != nil {
		return err
	}
	// Código de respaldo: sirve con cualquiera de los dos métodos.
	if activo && seguridad.EsRespaldo(codigo) {
		i := slices.Index(respaldo, seguridad.HashSHA256(codigo))
		if i < 0 {
			return httpx.Invalido("Ese código de respaldo no es válido o ya se usó.")
		}
		respaldo = slices.Delete(respaldo, i, i+1)
		if _, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_respaldo=$2 WHERE id=$1`, usuarioID, pq.Array(respaldo)); err != nil {
			return err
		}
		m.app.Auditar(ctx, m.app.DB, usuarioID, "usar_codigo_respaldo", "usuario", usuarioID, map[string]int{"quedan": len(respaldo)})
		return nil
	}
	if activo && metodo == "app" && cifrado != nil {
		sec, err := m.app.Cifrador.Descifrar(*cifrado)
		if err != nil {
			return err
		}
		if paso, ok := seguridad.VerificarTOTP(sec, codigo, time.Now()); ok && paso > ultimo {
			_, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_ultimo_paso=$2 WHERE id=$1`, usuarioID, paso)
			return err
		}
		return httpx.Invalido("El código no es correcto. Usa el código actual de tu app.")
	}
	// Por SMS (lo pide POST /me/codigo). El intento fallido se guarda aunque la acción no siga.
	return m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		err := m.validarOTP(ctx, tx, celular, "confirmar", codigo)
		if e, ok := err.(*httpx.Error); ok && e.Mensaje == "El código no es correcto." {
			tx.Commit()
		}
		return err
	})
}

// codigoConfirmar envía por SMS un código para confirmar una acción delicada (segundo paso por SMS).
func (m *Modulo) codigoConfirmar(w http.ResponseWriter, r *http.Request) error {
	u, _ := httpx.UsuarioDe(r.Context())
	var celular string
	if err := m.app.DB.QueryRowContext(r.Context(), `SELECT celular FROM usuarios WHERE id=$1`, u.ID).Scan(&celular); err != nil {
		return err
	}
	return m.enviarOTP(w, r, celular, "confirmar", map[string]any{"celular": cuentas.Ocultar(celular)})
}

// activarSMS activa el segundo paso por SMS con el código que llegó al celular (POST /me/codigo).
func (m *Modulo) activarSMS(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	if u.Rol == "admin" {
		return httpx.NuevoError(http.StatusForbidden, "mfa_app", "Los administradores usan siempre la app de autenticación.")
	}
	var in struct {
		Codigo string `json:"codigo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	var activo bool
	var celular string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT totp_activo, celular FROM usuarios WHERE id=$1`, u.ID).Scan(&activo, &celular); err != nil {
		return err
	}
	if activo {
		return httpx.Conflicto("mfa_activa", "Ya tienes activa la verificación en dos pasos.")
	}
	codigos, huellas := seguridad.NuevosRespaldos()
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if err := m.validarOTP(ctx, tx, celular, "confirmar", in.Codigo); err != nil {
			if e, ok := err.(*httpx.Error); ok && e.Mensaje == "El código no es correcto." {
				tx.Commit()
			}
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET totp_activo=true, mfa_metodo='sms', totp_secreto_cifrado=NULL, totp_pendiente_cifrado=NULL,
			totp_ultimo_paso=0, totp_respaldo=$2 WHERE id=$1`, u.ID, pq.Array(huellas)); err != nil {
			return err
		}
		m.app.Auditar(ctx, tx, u.ID, "activar_mfa", "usuario", u.ID, map[string]string{"metodo": "sms"})
		avisoSeguridad(ctx, tx, u.ID, "Activaste la verificación en dos pasos", "Desde ahora, al ingresar te enviaremos un código por SMS.")
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"codigos_respaldo": codigos})
	return nil
}

// nuevosRespaldos reemplaza los códigos de respaldo (los anteriores dejan de servir).
func (m *Modulo) nuevosRespaldos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	var in struct {
		Password string `json:"password"`
		Codigo   string `json:"codigo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	var hash string
	var activo bool
	if err := m.app.DB.QueryRowContext(ctx, `SELECT password_hash, totp_activo FROM usuarios WHERE id=$1`, u.ID).Scan(&hash, &activo); err != nil {
		return err
	}
	if !activo {
		return httpx.Invalido("Primero activa la verificación en dos pasos.")
	}
	if !seguridad.VerificarPassword(in.Password, hash) {
		return httpx.Invalido("Tu contraseña no es correcta.")
	}
	if err := m.ConfirmarPaso(ctx, u.ID, in.Codigo); err != nil {
		return err
	}
	codigos, huellas := seguridad.NuevosRespaldos()
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_respaldo=$2 WHERE id=$1`, u.ID, pq.Array(huellas)); err != nil {
		return err
	}
	m.app.Auditar(ctx, m.app.DB, u.ID, "nuevos_codigos_respaldo", "usuario", u.ID, nil)
	avisoSeguridad(ctx, m.app.DB, u.ID, "Generaste nuevos códigos de respaldo", "Los códigos anteriores ya no sirven. Si no fuiste tú, cambia tu contraseña.")
	httpx.OK(w, map[string]any{"codigos_respaldo": codigos})
	return nil
}
