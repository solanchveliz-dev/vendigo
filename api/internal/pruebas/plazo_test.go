package pruebas

import (
	"context"
	"testing"

	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

// pedidoConStock arma un pedido con 2 unidades apartadas de un producto (como lo hace la compra) y su plazo de pago.
func pedidoConStock(t *testing.T, tid, prod, estadoPago, vence string) string {
	t.Helper()
	pid := crearPedido(t, tid, "por_aceptar", estadoPago, 0)
	if _, err := base.Exec(`INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio_centimos, cantidad) VALUES ($1, $2, 'Producto de prueba', 2500, 2)`, pid, prod); err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`UPDATE productos SET stock = stock - 2 WHERE id=$1`, prod); err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`UPDATE pedidos SET pago_vence_en = now() + $2::interval WHERE id=$1`, pid, vence); err != nil {
		t.Fatal(err)
	}
	return pid
}

// Un pedido sin captura se cancela solo al vencer su plazo y el stock vuelve. Con captura, nunca se cancela solo.
// Antes del plazo no pasa nada.
func TestPedidoSinPagoVenceSolo(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	tid := crearTienda(t)
	prod := productoDePrueba(t, tid)
	if _, err := base.Exec(`UPDATE productos SET stock = 10 WHERE id=$1`, prod); err != nil {
		t.Fatal(err)
	}

	sinPago := pedidoConStock(t, tid, prod, "pendiente", "-1 minute")
	conCaptura := pedidoConStock(t, tid, prod, "comprobante_enviado", "-1 minute")
	aTiempo := pedidoConStock(t, tid, prod, "pendiente", "2 hours")
	if s := numero(t, `SELECT stock FROM productos WHERE id=$1`, prod); s != 4 {
		t.Fatalf("stock inicial de la prueba inesperado: %d (se esperaba 10 - 3 pedidos de 2)", s)
	}

	if _, err := pedidos.VencerPedidosSinPago(ctx, app); err != nil {
		t.Fatal(err)
	}
	if e := texto(t, `SELECT estado FROM pedidos WHERE id=$1`, sinPago); e != "cancelado" {
		t.Errorf("sin captura y con el plazo vencido, el pedido debía cancelarse (estado %q)", e)
	}
	if n := numero(t, `SELECT count(*) FROM pedidos WHERE id=$1 AND vencido_sin_pago`, sinPago); n != 1 {
		t.Error("el pedido vencido debía quedar marcado para no contar en el cupo del plan")
	}
	if e := texto(t, `SELECT estado FROM pedidos WHERE id=$1`, conCaptura); e != "por_aceptar" {
		t.Errorf("con captura enviada el pedido NUNCA se cancela solo (estado %q)", e)
	}
	if e := texto(t, `SELECT estado FROM pedidos WHERE id=$1`, aTiempo); e != "por_aceptar" {
		t.Errorf("antes del plazo el pedido no debe cancelarse (estado %q)", e)
	}
	if s := numero(t, `SELECT stock FROM productos WHERE id=$1`, prod); s != 6 {
		t.Errorf("solo debían volver las 2 unidades del pedido vencido (stock %d, se esperaba 6)", s)
	}
	// Repetir la tarea no devuelve stock dos veces.
	pedidos.VencerPedidosSinPago(ctx, app)
	if s := numero(t, `SELECT stock FROM productos WHERE id=$1`, prod); s != 6 {
		t.Errorf("repetir la tarea no debe devolver stock otra vez (stock %d)", s)
	}
}
