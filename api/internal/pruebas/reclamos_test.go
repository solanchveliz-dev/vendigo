package pruebas

import (
	"context"
	"database/sql"
	"testing"

	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

// comprobanteHace registra que el comprador subió su comprobante hace "horas" horas.
func comprobanteHace(t *testing.T, pid string, horas int) {
	t.Helper()
	if _, err := base.Exec(`INSERT INTO pago_eventos (pago_id, estado, detalle, creado_en)
		SELECT id, 'comprobante_enviado', 'Prueba', now() - make_interval(hours => $2) FROM pagos WHERE pedido_id=$1`, pid, horas); err != nil {
		t.Fatal(err)
	}
}

// "Pago no reconocido" va por el mismo módulo de reclamos: se puede abrir si la tienda dijo que no le llegó el
// pago, o si no revisa el comprobante en 48 h. VendiGo decide; el pedido nunca se confirma ni se cancela solo.
func TestReclamoPorPagoNoReconocido(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	admin := crearUsuario(t, "admin")
	tid := crearTienda(t)
	verificar(t, tid, "identidad")

	// Comprobante recién subido: todavía no se puede reclamar (la tienda tiene 48 h para revisarlo).
	p1 := crearPedido(t, tid, "por_aceptar", "comprobante_enviado", 0)
	comprobanteHace(t, p1, 1)
	if err := intentar(t, func(tx *sql.Tx) error {
		return pedidos.AbrirReclamo(ctx, tx, p1, "pago_no_reconocido", "Pagué por Yape", nil)
	}); err == nil {
		t.Fatal("no debía poder reclamarse el pago antes de 48 h sin respuesta de la tienda")
	}
	// Pasaron 48 h sin que la tienda revise: ya se puede reclamar.
	comprobanteHace(t, p1, 49)
	r1 := abrirReclamo(t, p1, "pago_no_reconocido")
	// VendiGo revisa el comprobante y le da la razón al comprador: devolución pendiente y pedido cancelado.
	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := pedidos.ResolverReclamo(ctx, app, tx, r1, "comprador", "El comprobante coincide con el Yape de la tienda.", admin)
		return err
	})
	if e := texto(t, `SELECT estado FROM pedidos WHERE id=$1`, p1); e != "cancelado" {
		t.Errorf("con el reclamo a favor del comprador el pedido debía cancelarse (estado %q)", e)
	}
	if n := numero(t, `SELECT count(*) FROM devoluciones WHERE pedido_id=$1 AND estado='pendiente_tienda' AND monto_centimos=5000`, p1); n != 1 {
		t.Errorf("debía abrirse una devolución pendiente por lo que pagó el comprador (hay %d)", n)
	}

	// La tienda dijo "no me llegó el pago": se puede reclamar al instante, aunque el pedido no se haya enviado.
	p2 := crearPedido(t, tid, "preparando", "no_recibido", 0)
	r2 := abrirReclamo(t, p2, "pago_no_reconocido")
	if _, _, b := estadoTienda(t, tid); b != "" {
		// p1 dejó una devolución pendiente tras la revisión: esa sí pausa. Se informa para aislar este caso.
		base.Exec(`UPDATE devoluciones SET estado='informada_tienda', evidencia_key='devolucion/x' WHERE pedido_id=$1`, p1)
	}
	if _, _, b := estadoTienda(t, tid); b != "" {
		t.Errorf("un reclamo de pago recién abierto no debe pausar la tienda (bloqueo %q)", b)
	}
	// VendiGo no encuentra prueba del pago: el pedido se cancela, sin devolución y sin marcarlo entregado.
	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := pedidos.ResolverReclamo(ctx, app, tx, r2, "vendedor", "El comprobante no corresponde a la cuenta de la tienda.", admin)
		return err
	})
	if e := texto(t, `SELECT estado FROM pedidos WHERE id=$1`, p2); e != "cancelado" {
		t.Errorf("sin prueba del pago el pedido debía cancelarse, no darse por entregado (estado %q)", e)
	}
	if n := numero(t, `SELECT count(*) FROM devoluciones WHERE pedido_id=$1`, p2); n != 0 {
		t.Errorf("si el pago no llegó no hay nada que devolver (devoluciones: %d)", n)
	}

	// Un pedido ya entregado no admite este motivo.
	p3 := crearPedido(t, tid, "entregado", "informado_tienda", 1)
	if err := intentar(t, func(tx *sql.Tx) error {
		return pedidos.AbrirReclamo(ctx, tx, p3, "pago_no_reconocido", "Prueba", nil)
	}); err == nil {
		t.Error("un pedido entregado no debe admitir el reclamo de pago no reconocido")
	}
}
