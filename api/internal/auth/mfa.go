package auth

import (
	"database/sql"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// Verificación en dos pasos de los administradores (TOTP, RFC 6238).
// 1) /auth/login valida correo y contraseña y devuelve un "desafío" (no una sesión).
// 2) /auth/mfa recibe el desafío + el código de la app y recién ahí crea la sesión.

const (
	desafioDuracion  = 5 * time.Minute
	desafioIntentos  = 5
	inactividadAdmin = 30 * time.Minute
	emisorTOTP       = "VendiGo"
)

type respuestaMFA struct {
	MFA     string `json:"mfa"` // "configurar" (primera vez) o "codigo"
	Desafio string `json:"desafio"`
	Secreto string `json:"secreto,omitempty"`
	URL     string `json:"otpauth_url,omitempty"`
	Cuenta  string `json:"cuenta"`
}

func (m *Modulo) desafioMFA(w http.ResponseWriter, r *http.Request, usuarioID string) error {
	ctx := r.Context()
	var activo bool
	var email string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT totp_activo, COALESCE(email,'') FROM usuarios WHERE id=$1`, usuarioID).Scan(&activo, &email); err != nil {
		return err
	}
	token := seguridad.TokenAleatorio()
	res := respuestaMFA{MFA: "codigo", Desafio: token, Cuenta: email}
	var secretoCifrado any
	if !activo {
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
	codigo := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(in.Codigo), " ", ""))
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
		if err := tx.QueryRowContext(ctx, `SELECT totp_secreto_cifrado, totp_ultimo_paso, totp_respaldo FROM usuarios WHERE id=$1 FOR UPDATE`, uid).
			Scan(&cifrado, &ultimo, pq.Array(&respaldo)); err != nil {
			return err
		}

		configurando := pendiente != nil
		fuente := cifrado
		if configurando {
			fuente = pendiente
		}
		ok, usoRespaldo := false, false
		if fuente != nil {
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
		if !ok && !configurando && len(codigo) == 11 {
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
			}
			return nil
		}

		if configurando {
			respaldoNuevo = seguridad.CodigosRespaldo(8)
			respaldo = make([]string, len(respaldoNuevo))
			for i, c := range respaldoNuevo {
				respaldo[i] = seguridad.HashSHA256(c)
			}
			if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET totp_secreto_cifrado=$2, totp_activo=true WHERE id=$1`, uid, *pendiente); err != nil {
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
