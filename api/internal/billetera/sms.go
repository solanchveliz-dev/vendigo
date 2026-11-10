package billetera

import (
	"context"
	"log/slog"
	"strings"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
)

// SMS con bandeja de salida (tabla sms_salientes). Se encolan dentro de la transacción del cambio y el worker
// los envía con Amazon SNS. Solo se usan en los momentos clave, porque cada SMS cuesta:
//   · a la tienda: pedido nuevo, comprobante del cliente, reclamo, verificación y suspensiones;
//   · al comprador (con el enlace de su seguimiento): pedido aceptado, rechazado, enviado, listo para recoger,
//     pago no encontrado, devolución informada y reclamo resuelto.
// Los pedidos de prueba (simulador y seed) nunca generan SMS.

const maxIntentosSMS = 3

// SMSTienda encola un SMS para la dueña de la tienda.
func SMSTienda(ctx context.Context, q core.Ejecutor, tiendaID, texto, enlace string) {
	if _, err := q.ExecContext(ctx, `INSERT INTO sms_salientes (celular, texto, enlace)
		SELECT u.celular, $2, $3 FROM tiendas t JOIN usuarios u ON u.id=t.usuario_id WHERE t.id::text=$1 AND u.celular <> ''`,
		tiendaID, texto, enlace); err != nil {
		slog.Error("sms tienda", "err", err)
	}
}

// SMSComprador encola un SMS para el comprador de un pedido, con el enlace a su seguimiento.
func SMSComprador(ctx context.Context, q core.Ejecutor, pedidoID, texto string) {
	if _, err := q.ExecContext(ctx, `INSERT INTO sms_salientes (celular, texto, enlace)
		SELECT p.comprador_celular, $2, '/seguimiento/' || p.token_seguimiento FROM pedidos p
		WHERE p.id::text=$1 AND p.comprador_celular <> ''
		  AND NOT EXISTS (SELECT 1 FROM pagos g WHERE g.pedido_id=p.id AND g.origen='prueba')`,
		pedidoID, texto); err != nil {
		slog.Error("sms comprador", "err", err)
	}
}

// EnviarSMSPendientes envía la bandeja de salida (lo llama el worker). Devuelve cuántos se enviaron.
// Cada SMS se reintenta hasta 3 veces y se descarta si tiene más de un día.
func EnviarSMSPendientes(ctx context.Context, app *core.App) (int, error) {
	if app.Avisos == nil {
		return 0, nil
	}
	rows, err := app.DB.QueryContext(ctx, `UPDATE sms_salientes SET intentos = intentos + 1 WHERE id IN (
		SELECT id FROM sms_salientes WHERE enviado_en IS NULL AND intentos < $1 AND creado_en > now() - interval '1 day'
		ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED)
		RETURNING id, celular, texto, enlace`, maxIntentosSMS)
	if err != nil {
		return 0, err
	}
	type sms struct {
		id                     int64
		celular, texto, enlace string
	}
	var lote []sms
	for rows.Next() {
		var s sms
		if err := rows.Scan(&s.id, &s.celular, &s.texto, &s.enlace); err == nil {
			lote = append(lote, s)
		}
	}
	rows.Close()
	base := strings.TrimRight(app.Cfg.WebURL, "/")
	enviados := 0
	for _, s := range lote {
		msg := "VendiGo: " + s.texto
		if s.enlace != "" {
			msg += " " + base + s.enlace
		}
		if err := app.Avisos.EnviarTexto(ctx, s.celular, msg); err != nil {
			app.DB.ExecContext(ctx, `UPDATE sms_salientes SET error=$2 WHERE id=$1`, s.id, err.Error())
			continue
		}
		app.DB.ExecContext(ctx, `UPDATE sms_salientes SET enviado_en=now(), error='' WHERE id=$1`, s.id)
		enviados++
	}
	return enviados, nil
}
