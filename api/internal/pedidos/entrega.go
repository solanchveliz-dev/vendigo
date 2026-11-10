package pedidos

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// MarcarEntregado cierra la entrega del pedido. No mueve dinero: VendiGo no lo administra.
func MarcarEntregado(ctx context.Context, tx *sql.Tx, pedidoID, por string) error {
	if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET estado='entregado', entregado_en=now(), confirmado_por=$2 WHERE id::text=$1`, pedidoID, por); err != nil {
		return err
	}
	detalle := map[string]string{
		"comprador":  "El comprador confirmó que lo recibió.",
		"automatico": "Se dio por recibido: pasaron 7 días desde el envío sin reclamos.",
		"vendedor":   "Entregado con el código del comprador.",
		"vendigo":    "VendiGo revisó el reclamo y las pruebas de la tienda. El pedido queda como entregado.",
	}[por]
	return evento(ctx, tx, pedidoID, "entregado", detalle)
}

// Barrer es la tarea programada (en AWS la dispara EventBridge; en local, el worker):
// da por recibidos los envíos por agencia que no se confirmaron ni reclamaron en 7 días.
func Barrer(ctx context.Context, app *core.App) (int, error) {
	if err := EscalarReclamos(ctx, app); err != nil {
		slog.Error("escalar reclamos", "err", err)
	}
	if n, err := VencerPedidosSinPago(ctx, app); err != nil {
		slog.Error("vencer pedidos sin pago", "err", err)
	} else if n > 0 {
		slog.Info("pedidos vencidos sin pago", "cantidad", n)
	}
	rows, err := app.DB.QueryContext(ctx, `SELECT p.id FROM pedidos p
		WHERE p.estado='enviado' AND p.entrega='agencia' AND p.enviado_en < now() - interval '7 days'
		AND NOT EXISTS (SELECT 1 FROM reclamos r WHERE r.pedido_id=p.id)`)
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	n := 0
	for _, id := range ids {
		if err := app.EnTransaccion(ctx, func(tx *sql.Tx) error { return MarcarEntregado(ctx, tx, id, "automatico") }); err != nil {
			slog.Error("confirmación automática", "pedido", id, "err", err)
			continue
		}
		n++
	}
	return n, nil
}

// pagoListo verifica que el pago permita enviar o dejar listo el pedido.
func pagoListo(ctx context.Context, tx *sql.Tx, pid string) error {
	e, err := pagos.Estado(ctx, tx, pid)
	if err != nil {
		return err
	}
	if !pagos.PermiteAvanzar(e) {
		return httpx.Conflicto("pago_pendiente", "Primero confirma que recibiste el pago (estado actual: "+pagos.Textos[e]+").")
	}
	return nil
}

// entregar: la tienda (o su motorizado) entrega el pedido y lo confirma con el código de 4 dígitos
// que tiene el comprador. Si pagaba al recibir, en el mismo paso informa si recibió el pago.
func (m *Modulo) entregar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Codigo       string `json:"codigo"`
		PagoRecibido bool   `json:"pago_recibido"`
		Referencia   string `json:"referencia"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(ctx)
	d, err := m.cambiar(r, []string{"listo_recojo", "enviado"}, func(tx *sql.Tx, tid, pid, codigo, entrega string) error {
		if entrega == "agencia" {
			return httpx.Conflicto("estado_invalido", "Los envíos por agencia los confirma el comprador al recibirlos.")
		}
		var esperado string
		tx.QueryRowContext(ctx, `SELECT codigo_recojo FROM pedidos WHERE id=$1`, pid).Scan(&esperado)
		if strings.TrimSpace(in.Codigo) != esperado {
			return httpx.Invalido("El código no coincide. Pídele al cliente el código de entrega que aparece en su seguimiento.")
		}
		estadoPago, err := pagos.Estado(ctx, tx, pid)
		if err != nil {
			return err
		}
		// Si falta cobrar (todo o el resto del adelanto), la tienda debe confirmar que le llegó el Yape/Plin.
		if estadoPago == "paga_al_recibir" || estadoPago == "adelanto_informado" {
			if !in.PagoRecibido {
				return httpx.Invalido("Antes de entregar, confirma que te llegó el pago por Yape o Plin.")
			}
			detalle := "La tienda informó que recibió el pago al entregar."
			if estadoPago == "adelanto_informado" {
				detalle = "La tienda informó que recibió el resto del pago al entregar."
			}
			if err := pagos.Cambiar(ctx, tx, pid, pagos.Cambio{Estado: "informado_tienda", Detalle: detalle, Usuario: u.ID, Referencia: strings.TrimSpace(in.Referencia)}); err != nil {
				return err
			}
		}
		return MarcarEntregado(ctx, tx, pid, "vendedor")
	})
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

// informarPago: la tienda revisa su Yape/Plin e informa si le llegó el pago (o el adelanto).
func (m *Modulo) informarPago(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Recibido   bool   `json:"recibido"`
		Referencia string `json:"referencia"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	pid := chi.URLParam(r, "id")
	u, _ := httpx.UsuarioDe(ctx)
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var estado string
		if err := tx.QueryRowContext(ctx, `SELECT estado FROM pedidos WHERE id::text=$1 AND tienda_id=$2 FOR UPDATE`, pid, tid).Scan(&estado); err != nil {
			if core.SinFilas(err) {
				return httpx.ErrNoEncontrado
			}
			return err
		}
		if estado == "rechazado" || estado == "cancelado" {
			return httpx.Conflicto("estado_invalido", "Este pedido ya se cerró.")
		}
		var metodo string
		tx.QueryRowContext(ctx, `SELECT metodo_pago FROM pedidos WHERE id::text=$1`, pid).Scan(&metodo)
		if metodo == "mercadopago" {
			return httpx.Conflicto("pago_proveedor", "Este pago lo confirma Mercado Pago automáticamente.")
		}
		c := pagos.Cambio{Estado: "informado_tienda", Detalle: "La tienda informó que recibió el pago.", Usuario: u.ID, Referencia: strings.TrimSpace(in.Referencia)}
		texto := "La tienda confirmó que recibió tu pago."
		var momento, actual string
		tx.QueryRowContext(ctx, `SELECT momento, estado FROM pagos WHERE pedido_id::text=$1`, pid).Scan(&momento, &actual)
		if momento == "adelanto" && actual != "adelanto_informado" {
			c.Detalle, c.Estado = "La tienda informó que recibió el adelanto.", "adelanto_informado"
			texto = "La tienda confirmó que recibió tu adelanto. El resto lo pagas al recibir."
		}
		if !in.Recibido {
			c.Estado, c.Detalle = "no_recibido", "La tienda informó que no le llegó el pago."
			texto = "La tienda no encontró tu pago. Revisa el número de Yape/Plin y vuelve a enviar tu comprobante, o abre un reclamo."
		}
		if err := pagos.Cambiar(ctx, tx, pid, c); err != nil {
			return err
		}
		if in.Recibido {
			// "Sí me llegó": si el comprador había reclamado su pago, el reclamo se cierra y el pedido sigue.
			res, err := tx.ExecContext(ctx, `UPDATE reclamos SET estado='a_favor_comprador',
				respuesta_vendedor=COALESCE(respuesta_vendedor, 'La tienda reconoció el pago y sigue con el pedido.'),
				respondido_en=COALESCE(respondido_en, now()), resuelto_en=now()
				WHERE pedido_id::text=$1 AND motivo='pago_no_reconocido' AND estado IN ('abierto','en_revision')`, pid)
			if err != nil {
				return err
			}
			if n, _ := res.RowsAffected(); n > 0 {
				texto = "La tienda reconoció tu pago y sigue con tu pedido. Tu reclamo quedó resuelto."
			}
		}
		return eventoConSMS(ctx, tx, pid, estado, texto)
	})
	if err != nil {
		return err
	}
	d, err := m.cargar(ctx, tid, pid)
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

// informarDevolucion: la tienda devolvió el dinero al comprador (por fuera de VendiGo) y lo informa con su prueba.
func (m *Modulo) informarDevolucion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		EvidenciaKey string `json:"evidencia_key"`
		Nota         string `json:"nota"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if in.EvidenciaKey == "" || !strings.HasPrefix(in.EvidenciaKey, "devolucion/"+tid+"/") {
		return httpx.Invalido("Sube la captura de la devolución (Yape, Plin o transferencia).")
	}
	pid := chi.URLParam(r, "id")
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var monto int
		err := tx.QueryRowContext(ctx, `UPDATE devoluciones d SET estado='informada_tienda', evidencia_key=$3, nota=$4, informada_en=now()
			FROM pedidos p WHERE d.pedido_id=p.id AND p.id::text=$1 AND p.tienda_id=$2 AND d.estado='pendiente_tienda' RETURNING d.monto_centimos`,
			pid, tid, in.EvidenciaKey, strings.TrimSpace(in.Nota)).Scan(&monto)
		if core.SinFilas(err) {
			return httpx.Conflicto("sin_devolucion", "Este pedido no tiene una devolución pendiente.")
		}
		if err != nil {
			return err
		}
		var estado string
		tx.QueryRowContext(ctx, `SELECT estado FROM pedidos WHERE id::text=$1`, pid).Scan(&estado)
		u, _ := httpx.UsuarioDe(ctx)
		m.app.Auditar(ctx, tx, u.ID, "informar_devolucion", "pedido", pid, map[string]int{"monto": monto})
		return eventoConSMS(ctx, tx, pid, estado, fmt.Sprintf("La tienda informó que te devolvió S/ %.2f. Si no te llegó, abre un reclamo o usa el Libro de Reclamaciones.", float64(monto)/100))
	})
	if err != nil {
		return err
	}
	d, err := m.cargar(ctx, tid, pid)
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

// ventas: reporte informativo de lo vendido por la tienda. No es un saldo ni dinero en VendiGo.
func (m *Modulo) ventas(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var k struct {
		VendidoMes      int `json:"vendido_mes_centimos"`
		PedidosMes      int `json:"pedidos_mes"`
		VendidoTotal    int `json:"vendido_total_centimos"`
		PedidosTotal    int `json:"pedidos_total"`
		PorConfirmar    int `json:"pagos_por_confirmar"`
		PorConfirmarMto int `json:"pagos_por_confirmar_centimos"`
		AlRecibir       int `json:"pagos_al_recibir"`
		Devoluciones    int `json:"devoluciones_pendientes"`
		DevolucionesMto int `json:"devoluciones_pendientes_centimos"`
	}
	m.app.DB.QueryRowContext(ctx, `SELECT
		COALESCE(SUM(p.total_centimos) FILTER (WHERE p.estado='entregado' AND date_trunc('month', p.entregado_en AT TIME ZONE 'America/Lima')=date_trunc('month', now() AT TIME ZONE 'America/Lima')),0),
		count(*) FILTER (WHERE p.estado='entregado' AND date_trunc('month', p.entregado_en AT TIME ZONE 'America/Lima')=date_trunc('month', now() AT TIME ZONE 'America/Lima')),
		COALESCE(SUM(p.total_centimos) FILTER (WHERE p.estado='entregado'),0),
		count(*) FILTER (WHERE p.estado='entregado'),
		count(*) FILTER (WHERE g.estado IN ('pendiente','comprobante_enviado','no_recibido') AND p.estado NOT IN ('rechazado','cancelado')),
		COALESCE(SUM(g.monto_centimos) FILTER (WHERE g.estado IN ('pendiente','comprobante_enviado','no_recibido') AND p.estado NOT IN ('rechazado','cancelado')),0),
		count(*) FILTER (WHERE g.estado='paga_al_recibir' AND p.estado NOT IN ('rechazado','cancelado','entregado'))
		FROM pedidos p JOIN pagos g ON g.pedido_id=p.id WHERE p.tienda_id=$1`, tid).
		Scan(&k.VendidoMes, &k.PedidosMes, &k.VendidoTotal, &k.PedidosTotal, &k.PorConfirmar, &k.PorConfirmarMto, &k.AlRecibir)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*), COALESCE(SUM(d.monto_centimos),0) FROM devoluciones d JOIN pedidos p ON p.id=d.pedido_id
		WHERE p.tienda_id=$1 AND d.estado='pendiente_tienda'`, tid).Scan(&k.Devoluciones, &k.DevolucionesMto)

	type linea struct {
		PedidoID   string     `json:"pedido_id"`
		Codigo     string     `json:"codigo"`
		Comprador  string     `json:"comprador"`
		Total      int        `json:"total_centimos"`
		Estado     string     `json:"estado"`
		PagoEstado string     `json:"pago_estado"`
		PagoTexto  string     `json:"pago_texto"`
		Metodo     string     `json:"metodo"`
		Devolucion *string    `json:"devolucion"`
		Fecha      time.Time  `json:"fecha"`
		Entregado  *time.Time `json:"entregado_en"`
	}
	lineas := []linea{}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, p.comprador_nombre, p.total_centimos, p.estado, g.estado, g.metodo,
		(SELECT d.estado FROM devoluciones d WHERE d.pedido_id=p.id ORDER BY d.creado_en DESC LIMIT 1), p.creado_en, p.entregado_en
		FROM pedidos p JOIN pagos g ON g.pedido_id=p.id WHERE p.tienda_id=$1 ORDER BY p.creado_en DESC LIMIT 200`, tid)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var l linea
		rows.Scan(&l.PedidoID, &l.Codigo, &l.Comprador, &l.Total, &l.Estado, &l.PagoEstado, &l.Metodo, &l.Devolucion, &l.Fecha, &l.Entregado)
		l.PagoTexto = pagos.Textos[l.PagoEstado]
		lineas = append(lineas, l)
	}
	httpx.OK(w, map[string]any{"resumen": k, "pedidos": lineas})
	return nil
}

// avisarTienda es un atajo para notificar a la tienda de un pedido.
func avisarTienda(ctx context.Context, tx *sql.Tx, tid, titulo, cuerpo, enlace string) {
	billetera.Notificar(ctx, tx, tid, titulo, cuerpo, enlace)
}

// EscalarReclamos: si la tienda no responde un reclamo en 48 h, el caso pasa a revisión de VendiGo y la tienda
// deja de recibir pedidos hasta que responda (la pausa la calcula tienda_reclamo_bloqueante). Se avisa una sola vez.
func EscalarReclamos(ctx context.Context, app *core.App) error {
	return app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx, `UPDATE reclamos c SET estado='en_revision'
			FROM pedidos p WHERE p.id=c.pedido_id AND c.estado='abierto' AND c.respondido_en IS NULL
			AND c.creado_en < now() - make_interval(hours => $1)
			RETURNING p.id, p.tienda_id, p.codigo`, HorasRespuesta)
		if err != nil {
			return err
		}
		type caso struct{ pid, tid, codigo string }
		var casos []caso
		for rows.Next() {
			var c caso
			if err := rows.Scan(&c.pid, &c.tid, &c.codigo); err != nil {
				rows.Close()
				return err
			}
			casos = append(casos, c)
		}
		rows.Close()
		for _, c := range casos {
			if err := evento(ctx, tx, c.pid, "reclamo", "La tienda no respondió en 48 horas: VendiGo revisará tu caso y te avisará."); err != nil {
				return err
			}
			billetera.Notificar(ctx, tx, c.tid, "Reclamo sin responder: tu tienda está en pausa",
				"No respondiste el reclamo del pedido "+c.codigo+" en 48 horas. Tu tienda no recibe pedidos nuevos hasta que respondas. VendiGo revisará el caso.",
				"/vendedor/cobros/reclamo/"+c.pid)
			billetera.SMSTienda(ctx, tx, c.tid, "No respondiste el reclamo del pedido "+c.codigo+" en 48 h. Tu tienda está en pausa hasta que respondas:", "/vendedor/cobros/reclamo/"+c.pid)
		}
		return nil
	})
}

// VencerPedidosSinPago cancela los pedidos cuyo plazo para pagar venció SIN captura (pago "pendiente") y devuelve
// el stock. Si el comprador ya subió su captura, nunca se cancela solo: lo decide la tienda o un reclamo.
func VencerPedidosSinPago(ctx context.Context, app *core.App) (int, error) {
	rows, err := app.DB.QueryContext(ctx, `SELECT p.id FROM pedidos p JOIN pagos g ON g.pedido_id=p.id
		WHERE p.pago_vence_en < now() AND g.estado='pendiente' AND p.estado IN ('por_aceptar','preparando','listo_recojo')
		ORDER BY p.pago_vence_en LIMIT 200`)
	if err != nil {
		return 0, err
	}
	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	n := 0
	for _, id := range ids {
		err := app.EnTransaccion(ctx, func(tx *sql.Tx) error {
			var tid, codigo, estado, pago string
			// Se vuelve a revisar con el pedido bloqueado: si la captura llegó justo ahora, no se cancela.
			err := tx.QueryRowContext(ctx, `SELECT p.tienda_id, p.codigo, p.estado, g.estado FROM pedidos p JOIN pagos g ON g.pedido_id=p.id
				WHERE p.id=$1 AND p.pago_vence_en < now() FOR UPDATE OF p, g`, id).Scan(&tid, &codigo, &estado, &pago)
			if core.SinFilas(err) {
				return errSinCambio
			}
			if err != nil {
				return err
			}
			if pago != "pendiente" || (estado != "por_aceptar" && estado != "preparando" && estado != "listo_recojo") {
				return errSinCambio
			}
			if err := devolverStock(ctx, tx, id); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET estado='cancelado', vencido_sin_pago=true,
				motivo_cancelacion='Venció el plazo para pagar', cerrado_en=now() WHERE id=$1`, id); err != nil {
				return err
			}
			if err := eventoConSMS(ctx, tx, id, "cancelado", "Tu pedido se canceló porque no se registró el pago a tiempo. Si todavía lo quieres, puedes volver a pedirlo en la tienda."); err != nil {
				return err
			}
			billetera.Notificar(ctx, tx, tid, "Pedido "+codigo+" vencido",
				"El cliente no pagó a tiempo: el pedido se canceló solo y el stock volvió a tu tienda.", "/vendedor/pedidos/"+id)
			return nil
		})
		if errors.Is(err, errSinCambio) {
			continue
		}
		if err != nil {
			slog.Error("vencer pedido sin pago", "pedido", id, "err", err)
			continue
		}
		n++
	}
	return n, nil
}

var errSinCambio = errors.New("sin cambio")
