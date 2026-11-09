package auth

import (
	"context"
	"database/sql"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// ---------- verificación en dos pasos desde Configuración (vendedoras) ----------

func (m *Modulo) estadoMFA(w http.ResponseWriter, r *http.Request) error {
	u, _ := httpx.UsuarioDe(r.Context())
	var activo bool
	var respaldo []string
	if err := m.app.DB.QueryRowContext(r.Context(), `SELECT totp_activo, totp_respaldo FROM usuarios WHERE id=$1`, u.ID).Scan(&activo, pq.Array(&respaldo)); err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"activo": activo, "respaldo_restantes": len(respaldo), "obligatoria": u.Rol == "admin"})
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
	codigos := seguridad.CodigosRespaldo(8)
	huellas := make([]string, len(codigos))
	for i, c := range codigos {
		huellas[i] = seguridad.HashSHA256(c)
	}
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_secreto_cifrado=totp_pendiente_cifrado, totp_pendiente_cifrado=NULL,
		totp_activo=true, totp_ultimo_paso=$2, totp_respaldo=$3 WHERE id=$1`, u.ID, paso, pq.Array(huellas)); err != nil {
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
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_activo=false, totp_secreto_cifrado=NULL, totp_respaldo='{}', totp_ultimo_paso=0 WHERE id=$1`, u.ID); err != nil {
		return err
	}
	m.app.Auditar(ctx, m.app.DB, u.ID, "desactivar_mfa", "usuario", u.ID, nil)
	avisoSeguridad(ctx, m.app.DB, u.ID, "Desactivaste la verificación en dos pasos", "Si no fuiste tú, cambia tu contraseña de inmediato.")
	httpx.OK(w, map[string]string{"mensaje": "Desactivaste la verificación en dos pasos."})
	return nil
}

// ---------- confirmar que es la persona antes de algo delicado ----------

// pedirConfirmacion indica cómo confirmar: con la app (si la activó) o con un SMS que se envía ahora.
func (m *Modulo) pedirConfirmacion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	var activo bool
	var celular string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT totp_activo, celular FROM usuarios WHERE id=$1`, u.ID).Scan(&activo, &celular); err != nil {
		return err
	}
	if activo {
		httpx.OK(w, map[string]string{"metodo": "app"})
		return nil
	}
	return m.enviarOTP(w, r, celular, "confirmar", map[string]any{"metodo": "sms", "celular": "••• ••• " + celular[len(celular)-3:]})
}

// ConfirmarPaso valida el código antes de una acción delicada: el de la app de autenticación
// (o un código de respaldo) si la tiene activa; si no, el que se le envió por SMS.
func (m *Modulo) ConfirmarPaso(ctx context.Context, usuarioID, codigo string) error {
	codigo = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(codigo), " ", ""))
	if codigo == "" {
		return httpx.NuevoError(http.StatusForbidden, "confirmacion_requerida", "Por seguridad, confirma que eres tú con un código.")
	}
	var activo bool
	var cifrado *string
	var ultimo int64
	var respaldo []string
	var celular string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT totp_activo, totp_secreto_cifrado, totp_ultimo_paso, totp_respaldo, celular FROM usuarios WHERE id=$1`, usuarioID).
		Scan(&activo, &cifrado, &ultimo, pq.Array(&respaldo), &celular); err != nil {
		return err
	}
	if !activo || cifrado == nil {
		// Por SMS. El intento fallido se guarda aunque la acción no siga.
		return m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
			err := m.validarOTP(ctx, tx, celular, "confirmar", codigo)
			if e, ok := err.(*httpx.Error); ok && e.Mensaje == "El código no es correcto." {
				tx.Commit()
			}
			return err
		})
	}
	sec, err := m.app.Cifrador.Descifrar(*cifrado)
	if err != nil {
		return err
	}
	if paso, ok := seguridad.VerificarTOTP(sec, codigo, time.Now()); ok && paso > ultimo {
		_, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_ultimo_paso=$2 WHERE id=$1`, usuarioID, paso)
		return err
	}
	if i := slices.Index(respaldo, seguridad.HashSHA256(codigo)); i >= 0 {
		respaldo = slices.Delete(respaldo, i, i+1)
		if _, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET totp_respaldo=$2 WHERE id=$1`, usuarioID, pq.Array(respaldo)); err != nil {
			return err
		}
		m.app.Auditar(ctx, m.app.DB, usuarioID, "usar_codigo_respaldo", "usuario", usuarioID, map[string]int{"quedan": len(respaldo)})
		return nil
	}
	return httpx.Invalido("El código no es correcto. Usa el código actual de tu app.")
}
