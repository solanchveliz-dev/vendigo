package pruebas

import (
	"context"
	"fmt"
	"sync"
	"testing"

	"github.com/solanchveliz-dev/vendigo/api/internal/live"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

// separar hace lo mismo que la compra desde el live: valida el live y crea el pedido con plazo de minutos.
func separar(ctx context.Context, tid, prod, celular string) error {
	tx, err := base.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	plazo, err := live.Validar(ctx, tx, tid, celular, []string{prod})
	if err != nil {
		return err
	}
	pid, _, err := pedidos.Crear(ctx, app, tx, pedidos.PedidoNuevo{TiendaID: tid, Nombre: "Compradora", Celular: celular,
		Entrega: "recojo", MetodoPago: "yape_directo", PlazoPago: plazo, PagoAntes: true,
		Items: []pedidos.ItemNuevo{{ProductoID: prod, Cantidad: 1}}})
	if err != nil {
		return err
	}
	if _, err := tx.Exec(`UPDATE pedidos SET del_live=true WHERE id=$1`, pid); err != nil {
		return err
	}
	return tx.Commit()
}

// Modo live: muchas personas tocan "Separar" a la vez por la última unidad y solo una la obtiene. La separación es
// un pedido con plazo de minutos: si no se paga, se cancela solo y la unidad vuelve para la siguiente.
func TestLiveUltimaUnidadYVencimiento(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	tid := crearTienda(t)
	verificar(t, tid, "identidad")
	if _, err := base.Exec(`UPDATE tiendas SET yape_numero='999111222' WHERE id=$1`, tid); err != nil {
		t.Fatal(err)
	}
	prod := productoDePrueba(t, tid)
	if _, err := base.Exec(`UPDATE productos SET stock=1 WHERE id=$1`, prod); err != nil {
		t.Fatal(err)
	}

	// Con el live apagado no se puede separar.
	if err := separar(ctx, tid, prod, "981000000"); err == nil {
		t.Fatal("con el live apagado no debía poder separarse")
	}
	// Live prendido con 3 minutos, pero el producto todavía no está en el live.
	if _, err := base.Exec(`UPDATE tiendas SET live_activo=true, live_minutos=3, live_desde=now() WHERE id=$1`, tid); err != nil {
		t.Fatal(err)
	}
	if err := separar(ctx, tid, prod, "981000000"); err == nil {
		t.Fatal("un producto que no está en el live no debía poder separarse")
	}
	if _, err := base.Exec(`UPDATE productos SET live_codigo=12 WHERE id=$1`, prod); err != nil {
		t.Fatal(err)
	}

	// 20 personas a la vez por la última unidad: exactamente una la consigue.
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok := 0
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			if separar(ctx, tid, prod, fmt.Sprintf("98200%04d", i)) == nil {
				mu.Lock()
				ok++
				mu.Unlock()
			}
		}(i)
	}
	wg.Wait()
	if ok != 1 {
		t.Fatalf("la última unidad debía quedar para una sola persona (la consiguieron %d)", ok)
	}
	if s := numero(t, `SELECT stock FROM productos WHERE id=$1`, prod); s != 0 {
		t.Fatalf("la unidad separada debía descontarse del stock (stock %d)", s)
	}
	pid := texto(t, `SELECT id::text FROM pedidos WHERE tienda_id=$1 AND del_live AND estado <> 'cancelado'`, tid)
	// El plazo es de minutos y el pago es antes (aunque la tienda acepte pagar al recibir).
	if n := numero(t, `SELECT count(*) FROM pedidos p JOIN pagos g ON g.pedido_id=p.id WHERE p.id=$1 AND g.estado='pendiente'
		AND p.pago_vence_en BETWEEN now() + interval '2 minutes' AND now() + interval '4 minutes'`, pid); n != 1 {
		t.Fatal("la separación debía quedar con el pago pendiente y un plazo de 3 minutos")
	}

	// Nadie pagó: vence, se cancela sola y la unidad vuelve.
	if _, err := base.Exec(`UPDATE pedidos SET pago_vence_en = now() - interval '1 second' WHERE id=$1`, pid); err != nil {
		t.Fatal(err)
	}
	if _, err := pedidos.VencerPedidosSinPago(ctx, app); err != nil {
		t.Fatal(err)
	}
	if s := numero(t, `SELECT stock FROM productos WHERE id=$1`, prod); s != 1 {
		t.Fatalf("al vencer la separación la unidad debía volver (stock %d)", s)
	}

	// Una misma persona no puede acaparar: máximo 3 separaciones sin pagar en la tienda.
	if _, err := base.Exec(`UPDATE productos SET stock=10 WHERE id=$1`, prod); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < live.MaxSeparadosPorCelular; i++ {
		if err := separar(ctx, tid, prod, "983000000"); err != nil {
			t.Fatalf("la separación %d debía aceptarse: %v", i+1, err)
		}
	}
	if err := separar(ctx, tid, prod, "983000000"); err == nil {
		t.Error("la cuarta separación sin pagar de la misma persona debía rechazarse")
	}
}
