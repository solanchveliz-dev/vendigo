package auth

import (
	"context"
	"database/sql"
	"net/http"
	"slices"
	"time"

	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/cuentas"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// Verificación en dos pasos de los administradores (TOTP, RFC 6238).
// 1) /auth/login valida correo y contraseña y devuelve un "desafío" (no una sesión).
// 2) /auth/mfa recibe el desafío + el código de la app y recién ahí crea la sesión.

const (
	desafioDuracion = 5 * time.Minute
	desafioIntentos = 5
	emisorTOTP      = "VendiGo"
)

type respuestaMFA struct {
	MFA     string `json:"mfa"` // "configurar" (primera vez), "codigo" (app) o "sms"
	Desafio string `json:"desafio"`
	Secreto string `json:"secreto,omitempty"`
	URL     string `json:"otpauth_url,omitempty"`
	Cuenta  string `json:"cuenta"`
	// Solo con "sms": a qué número llegó (oculto) y, en desarrollo, el código.
	Celular   string `json:"celular,omitempty"`
	CodigoDev string `json:"codigo_dev,omitempty"`
}

func (m *Modulo) desafioMFA(w http.ResponseWriter, r *http.Request, usuarioID string) error {
	ctx := r.Context()
	var activo bool
	var email, metodo, rol, celular string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT totp_activo, COALESCE(email,''), mfa_metodo, rol, celular FROM usuarios WHERE id=$1`, usuarioID).
		Scan(&activo, &email, &metodo, &rol, &celular); err != nil {
		return err
	}
	token := seguridad.TokenAleatorio()
	res := respuestaMFA{MFA: "codigo", Desafio: token, Cuenta: email}
	var secretoCifrado any
	if activo && metodo == "sms" && rol != "admin" {
		// Segundo paso por SMS: se envía el código al celular de la cuenta.
		codigo, err := m.GenerarOTP(ctx, celular, "ingreso")
		if e, ok := err.(*httpx.Error); ok && e.Codigo == "espera_codigo" {
			err = nil // ya se envió uno hace menos de un minuto y sigue sirviendo
		}
		if err != nil {
			return err
		}
		res.MFA, res.Celular = "sms", cuentas.Ocultar(celular)
		if m.app.Cfg.MostrarCodigoDev() {
			res.CodigoDev = codigo
		}
	} else if !activo {
		// Primera vez: se genera el secreto que se escaneará con la app. Solo se guarda al confirmar un código.
		sec := seguridad.NuevoSecretoTOTP()
		c, err := m.app.Cifrador.Cifrar(sec)
		if err != nil {
			return err
		}
		secretoCifrado = c
		res.MFA, res.Secreto, res.URL = "configurar", sec, seguridad.URLTOTP(emisorTOTP, email, sec)
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO mfa_desafios (token_hash, usuario_id, secreto_cifrado, expira_en) VALUES ($1,$2,$3,$4)`,
		seguridad.HashSHA256(token), usuarioID, secretoCifrado, time.Now().Add(desafioDuracion)); err != nil {
		return err
	}
	m.app.DB.ExecContext(ctx, `DELETE FROM mfa_desafios WHERE expira_en < now()`)
	httpx.OK(w, res)
	return nil
}

func (m *Modulo) mfa(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Desafio string `json:"desafio"`
		Codigo  string `json:"codigo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	codigo := seguridad.NormalizarCodigo(in.Codigo)
	ctx := r.Context()
	var uid string
	var respaldoNuevo []string
	fallo := ""
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var pendiente *string
		var intentos int
		err := tx.QueryRowContext(ctx, `SELECT usuario_id, secreto_cifrado, intentos FROM mfa_desafios
			WHERE token_hash=$1 AND expira_en > now() FOR UPDATE`, seguridad.HashSHA256(in.Desafio)).Scan(&uid, &pendiente, &intentos)
		if core.SinFilas(err) {
			return httpx.NuevoError(http.StatusUnauthorized, "desafio_vencido", "Pasaron más de 5 minutos. Vuelve a ingresar tu correo y contraseña.")
		}
		if err != nil {
			return err
		}
		var cifrado *string
		var ultimo int64
		var respaldo []string
		var metodo, rol, celular string
		if err := tx.QueryRowContext(ctx, `SELECT totp_secreto_cifrado, totp_ultimo_paso, totp_respaldo, mfa_metodo, rol, celular FROM usuarios WHERE id=$1 FOR UPDATE`, uid).
			Scan(&cifrado, &ultimo, pq.Array(&respaldo), &metodo, &rol, &celular); err != nil {
			return err
		}
		porSMS := metodo == "sms" && rol != "admin" && pendiente == nil

		configurando := pendiente != nil
		fuente := cifrado
		if configurando {
			fuente = pendiente
		}
		ok, usoRespaldo := false, false
		msgSMS := ""
		if porSMS && !seguridad.EsRespaldo(codigo) {
			if err := m.validarOTP(ctx, tx, celular, "ingreso", codigo); err == nil {
				ok = true
			} else if e, esErr := err.(*httpx.Error); esErr && e.Mensaje != "El código no es correcto." {
				msgSMS = e.Mensaje // venció o hay que pedir otro
			} else if !esErr {
				return err
			}
		} else if fuente != nil && !porSMS {
			sec, err := m.app.Cifrador.Descifrar(*fuente)
			if err != nil {
				return err
			}
			if paso, valido := seguridad.VerificarTOTP(sec, codigo, time.Now()); valido && paso > ultimo {
				ok = true
				ultimo = paso
			}
		}
		// Código de respaldo (solo cuando la app ya estaba configurada).
		if !ok && !configurando && seguridad.EsRespaldo(codigo) {
			h := seguridad.HashSHA256(codigo)
			if i := slices.Index(respaldo, h); i >= 0 {
				ok, usoRespaldo = true, true
				respaldo = slices.Delete(respaldo, i, i+1)
			}
		}
		if !ok {
			intentos++
			if intentos >= desafioIntentos {
				tx.ExecContext(ctx, `DELETE FROM mfa_desafios WHERE token_hash=$1`, seguridad.HashSHA256(in.Desafio))
				fallo = "Demasiados códigos incorrectos. Vuelve a ingresar tu correo y contraseña."
			} else {
				tx.ExecContext(ctx, `UPDATE mfa_desafios SET intentos=$2 WHERE token_hash=$1`, seguridad.HashSHA256(in.Desafio), intentos)
				fallo = "El código no es correcto. Revisa que la hora de tu celular esté bien y usa el código actual."
				if porSMS {
					fallo = "El código no es correcto. Revisa el último SMS que te llegó."
					if msgSMS != "" {
						fallo = msgSMS
					}
				}
			}
			return nil
		}

		if configurando {
			respaldoNuevo, respaldo = seguridad.NuevosRespaldos()
			if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET totp_secreto_cifrado=$2, totp_activo=true, mfa_metodo='app' WHERE id=$1`, uid, *pendiente); err != nil {
				return err
			}
			m.app.Auditar(ctx, tx, uid, "activar_mfa", "usuario", uid, nil)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET totp_ultimo_paso=$2, totp_respaldo=$3 WHERE id=$1`, uid, ultimo, pq.Array(respaldo)); err != nil {
			return err
		}
		if usoRespaldo {
			m.app.Auditar(ctx, tx, uid, "usar_codigo_respaldo", "usuario", uid, map[string]int{"quedan": len(respaldo)})
			avisoSeguridad(ctx, tx, uid, "Usaste un código de respaldo", "Te quedan los demás códigos. Si perdiste tu celular, pide que reinicien tu verificación en dos pasos.")
		}
		_, err = tx.ExecContext(ctx, `DELETE FROM mfa_desafios WHERE token_hash=$1`, seguridad.HashSHA256(in.Desafio))
		return err
	})
	if err != nil {
		return err
	}
	if fallo != "" {
		m.registrarAcceso(r, uid, false, "código de verificación incorrecto")
		return httpx.NuevoError(http.StatusUnauthorized, "codigo_mfa", fallo)
	}
	m.avisarEquipoNuevo(r, uid)
	m.registrarAcceso(r, uid, true, "")
	s, err := m.crearSesion(ctx, uid)
	if err != nil {
		return err
	}
	s.CodigosRespaldo = respaldoNuevo
	httpx.OK(w, s)
	return nil
}

// reenviarMFA manda otro SMS con el código de ingreso (segundo paso por SMS).
func (m *Modulo) reenviarMFA(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Desafio string `json:"desafio"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	ctx := r.Context()
	var celular, metodo string
	err := m.app.DB.QueryRowContext(ctx, `SELECT u.celular, u.mfa_metodo FROM mfa_desafios d JOIN usuarios u ON u.id=d.usuario_id
		WHERE d.token_hash=$1 AND d.expira_en > now()`, seguridad.HashSHA256(in.Desafio)).Scan(&celular, &metodo)
	if core.SinFilas(err) {
		return httpx.NuevoError(http.StatusUnauthorized, "desafio_vencido", "Pasaron más de 5 minutos. Vuelve a ingresar tu celular y contraseña.")
	}
	if err != nil {
		return err
	}
	if metodo != "sms" {
		return httpx.Invalido("Tu cuenta usa una app de autenticación.")
	}
	return m.enviarOTP(w, r, celular, "ingreso", map[string]any{"celular": cuentas.Ocultar(celular)})
}

// inactividadAdmin: minutos sin uso tras los que se cierra la sesión de un administrador
// (se cambia en Admin → Seguridad; 30 por defecto).
func (m *Modulo) inactividadAdmin(ctx context.Context) time.Duration {
	min := 30
	m.app.DB.QueryRowContext(ctx, `SELECT valor::int FROM ajustes_plataforma WHERE clave='inactividad_admin_min'`).Scan(&min)
	return time.Duration(min) * time.Minute
}
