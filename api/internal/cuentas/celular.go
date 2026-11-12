// Package cuentas cambia el número de celular de una cuenta, que es su llave para entrar y recibir códigos.
//
// Hay dos caminos:
//   - Con sesión: la persona confirma su contraseña (y su app autenticadora si la usa) y un código que llega
//     al número nuevo. El cambio es inmediato.
//   - Sin acceso a su número: envía una solicitud con su DNI y una selfie. Solo se crea si el DNI coincide con
//     su verificación de identidad aprobada, y un administrador la revisa comparando las fotos.
package cuentas

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// PrefijoArchivos es la carpeta del bucket privado donde se suben el DNI y la selfie de una solicitud.
const PrefijoArchivos = "cambio-celular/"

// Cambio describe un cambio de número ya validado.
type Cambio struct {
	UsuarioID string
	Nuevo     string
	// ConservarSesion es el refresh token del equipo que hace el cambio (no se cierra). Vacío: se cierran todas.
	ConservarSesion string
	// QuitarDosPasos desactiva la app autenticadora (estaba en el celular perdido).
	QuitarDosPasos bool
	Actor          string // quien hace el cambio (la misma persona o el administrador)
	Origen         string // "directo" o "solicitud"
}

// Aplicar cambia el número dentro de una transacción. Devuelve el número anterior.
func Aplicar(ctx context.Context, tx *sql.Tx, app *core.App, c Cambio) (string, error) {
	var anterior string
	if err := tx.QueryRowContext(ctx, `SELECT celular FROM usuarios WHERE id::text=$1 FOR UPDATE`, c.UsuarioID).Scan(&anterior); err != nil {
		if core.SinFilas(err) {
			return "", httpx.NuevoError(http.StatusNotFound, "no_existe", "La cuenta no existe.")
		}
		return "", err
	}
	if anterior == c.Nuevo {
		return "", httpx.Invalido("Ese ya es tu número.")
	}
	var ocupado bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM usuarios WHERE celular=$1 AND id::text<>$2)`, c.Nuevo, c.UsuarioID).Scan(&ocupado); err != nil {
		return "", err
	}
	if ocupado {
		return "", httpx.Conflicto("celular_en_uso", "Ese número ya está registrado en otra cuenta de VendiGo.")
	}
	dosPasos := ""
	if c.QuitarDosPasos {
		dosPasos = `, totp_activo=false, totp_secreto_cifrado=NULL, totp_pendiente_cifrado=NULL, totp_respaldo='{}', totp_ultimo_paso=0`
	}
	if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET celular=$2, celular_verificado=true, intentos_fallidos=0, bloqueado_hasta=NULL`+dosPasos+` WHERE id::text=$1`,
		c.UsuarioID, c.Nuevo); err != nil {
		return "", err
	}
	// Sesiones: se cierran todas menos la del equipo que hizo el cambio (si lo hizo con sesión).
	if _, err := tx.ExecContext(ctx, `UPDATE refresh_tokens SET revocado=true WHERE usuario_id::text=$1 AND NOT revocado AND token_hash<>$2`,
		c.UsuarioID, seguridad.HashSHA256(c.ConservarSesion)); err != nil {
		return "", err
	}
	// Los códigos pendientes del número anterior dejan de servir.
	if _, err := tx.ExecContext(ctx, `UPDATE codigos_otp SET usado=true WHERE celular=$1 AND NOT usado`, anterior); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo)
		SELECT id, 'Cambiaste tu número de celular', $2, CASE WHEN rol='admin' THEN '/admin/seguridad' ELSE '/vendedor/configuracion' END,
		CASE WHEN rol='admin' THEN 'seguridad' ELSE 'pagos' END FROM usuarios WHERE id::text=$1`,
		c.UsuarioID, "Tu cuenta ahora usa el número "+Ocultar(c.Nuevo)+". Si no fuiste tú, escríbenos a ayuda@vendigo.pe."); err != nil {
		return "", err
	}
	app.Auditar(ctx, tx, c.Actor, "cambiar_celular", "usuario", c.UsuarioID, map[string]string{
		"anterior": Ocultar(anterior), "nuevo": Ocultar(c.Nuevo), "origen": c.Origen,
	})
	return anterior, nil
}

// EncolarSMS deja un SMS en la bandeja de salida (lo envía el worker con reintentos).
func EncolarSMS(ctx context.Context, q core.Ejecutor, celular, texto, enlace string) error {
	_, err := q.ExecContext(ctx, `INSERT INTO sms_salientes (celular, texto, enlace) VALUES ($1, $2, $3)`, celular, texto, enlace)
	return err
}

// ---------- solicitudes sin acceso al número ----------

// Solicitud es lo que envía la persona que perdió su número.
type Solicitud struct {
	CelularAnterior string
	CelularNuevo    string
	Documento       string
	FrenteKey       string
	SelfieKey       string
	IP              string
}

// Crear registra la solicitud solo si el número anterior es de una cuenta con identidad verificada y el
// documento coincide. Devuelve false (sin error) si no corresponde: quien llama responde lo mismo en ambos
// casos, para que nadie averigüe qué números o documentos están registrados.
func Crear(ctx context.Context, tx *sql.Tx, app *core.App, s Solicitud) (bool, error) {
	if !strings.HasPrefix(s.FrenteKey, PrefijoArchivos) || !strings.HasPrefix(s.SelfieKey, PrefijoArchivos) {
		return false, httpx.Invalido("Sube la foto de tu documento y tu selfie.")
	}
	var uid string
	var cifrado string
	err := tx.QueryRowContext(ctx, `SELECT u.id::text, v.numero_cifrado
		FROM usuarios u JOIN tiendas t ON t.usuario_id=u.id
		JOIN verificaciones v ON v.tienda_id=t.id AND v.clase='identidad' AND v.estado='aprobada'
		WHERE u.celular=$1 AND u.rol='vendedor'
		ORDER BY v.revisado_en DESC NULLS LAST LIMIT 1`, s.CelularAnterior).Scan(&uid, &cifrado)
	if core.SinFilas(err) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	numero, err := app.Cifrador.Descifrar(cifrado)
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(numero) != strings.TrimSpace(s.Documento) {
		return false, nil
	}
	var ocupado bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM usuarios WHERE celular=$1)`, s.CelularNuevo).Scan(&ocupado); err != nil {
		return false, err
	}
	if ocupado {
		return false, httpx.Conflicto("celular_en_uso", "Ese número ya está registrado en otra cuenta de VendiGo.")
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO solicitudes_celular (usuario_id, celular_anterior, celular_nuevo, frente_key, selfie_key, ip)
		VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (usuario_id) WHERE estado='pendiente' DO NOTHING`,
		uid, s.CelularAnterior, s.CelularNuevo, s.FrenteKey, s.SelfieKey, s.IP)
	if err != nil {
		return false, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return false, nil // ya hay una pendiente
	}
	if _, err := tx.ExecContext(ctx, `SELECT avisar_admins('Solicitud de cambio de número', $1, '/admin/cambios-numero', 'seguridad')`,
		"Una vendedora pidió cambiar su número "+Ocultar(s.CelularAnterior)+" por "+Ocultar(s.CelularNuevo)+". Revisa su DNI y selfie."); err != nil {
		return false, err
	}
	app.Auditar(ctx, tx, uid, "solicitar_cambio_celular", "usuario", uid, map[string]string{"nuevo": Ocultar(s.CelularNuevo)})
	return true, nil
}

// Aprobar aplica una solicitud pendiente: cambia el número, cierra todas las sesiones y quita los dos pasos.
func Aprobar(ctx context.Context, tx *sql.Tx, app *core.App, id, adminID string) error {
	var uid, nuevo string
	err := tx.QueryRowContext(ctx, `UPDATE solicitudes_celular SET estado='aprobada', revisado_en=now(), revisado_por=$2
		WHERE id::text=$1 AND estado='pendiente' RETURNING usuario_id::text, celular_nuevo`, id, adminID).Scan(&uid, &nuevo)
	if core.SinFilas(err) {
		return httpx.Conflicto("ya_revisada", "Esta solicitud ya se revisó o no existe.")
	}
	if err != nil {
		return err
	}
	if _, err := Aplicar(ctx, tx, app, Cambio{UsuarioID: uid, Nuevo: nuevo, QuitarDosPasos: true, Actor: adminID, Origen: "solicitud"}); err != nil {
		return err
	}
	app.Auditar(ctx, tx, adminID, "aprobar_cambio_celular", "solicitud_celular", id, nil)
	return EncolarSMS(ctx, tx, nuevo, "VendiGo: aprobamos el cambio de tu número. Para entrar, crea una contraseña nueva en «¿Olvidaste tu contraseña?»:", "/recuperar")
}

// Rechazar cierra una solicitud pendiente sin cambiar nada de la cuenta.
func Rechazar(ctx context.Context, tx *sql.Tx, app *core.App, id, adminID, motivo string) error {
	var nuevo string
	err := tx.QueryRowContext(ctx, `UPDATE solicitudes_celular SET estado='rechazada', motivo_rechazo=$3, revisado_en=now(), revisado_por=$2
		WHERE id::text=$1 AND estado='pendiente' RETURNING celular_nuevo`, id, adminID, motivo).Scan(&nuevo)
	if core.SinFilas(err) {
		return httpx.Conflicto("ya_revisada", "Esta solicitud ya se revisó o no existe.")
	}
	if err != nil {
		return err
	}
	app.Auditar(ctx, tx, adminID, "rechazar_cambio_celular", "solicitud_celular", id, map[string]string{"motivo": motivo})
	return EncolarSMS(ctx, tx, nuevo, "VendiGo: no pudimos aprobar el cambio de número. Motivo: "+recortar(motivo, 90)+". Escríbenos a ayuda@vendigo.pe.", "")
}

// ocultar muestra solo los últimos 3 dígitos: 9••••••123.
func Ocultar(c string) string {
	if len(c) < 4 {
		return c
	}
	return c[:1] + strings.Repeat("•", len(c)-4) + c[len(c)-3:]
}

func recortar(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
