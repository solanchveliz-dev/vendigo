package pruebas

import (
	"context"
	"testing"

	"github.com/solanchveliz-dev/vendigo/api/internal/comprador"
)

// Al crear su cuenta, los pedidos que el comprador hizo antes con su celular verificado quedan en "Mis pedidos";
// si el celular no está verificado, no se une nada (nadie ve compras ajenas registrándose con otro número).
func TestMisPedidosUneComprasAnterioresSoloConCelularVerificado(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	pid := crearPedido(t, tid, "por_aceptar", "pendiente", 0)
	// Un pedido anterior a esta prueba puede tener el mismo número: se usa uno propio.
	nuevo := numeroLibre()
	if _, err := base.Exec(`UPDATE pedidos SET comprador_celular=$2 WHERE id=$1`, pid, nuevo); err != nil {
		t.Fatal(err)
	}
	uid := crearUsuario(t, "comprador")
	if _, err := base.Exec(`UPDATE usuarios SET celular=$2, celular_verificado=false WHERE id=$1`, uid, nuevo); err != nil {
		t.Fatal(err)
	}
	if err := comprador.Unir(context.Background(), base, uid); err != nil {
		t.Fatal(err)
	}
	if n := numero(t, `SELECT count(*) FROM pedidos WHERE comprador_id=$1`, uid); n != 0 {
		t.Fatal("sin celular verificado no debía unirse ningún pedido")
	}
	if _, err := base.Exec(`UPDATE usuarios SET celular_verificado=true WHERE id=$1`, uid); err != nil {
		t.Fatal(err)
	}
	if err := comprador.Unir(context.Background(), base, uid); err != nil {
		t.Fatal(err)
	}
	if n := numero(t, `SELECT count(*) FROM pedidos WHERE comprador_id=$1`, uid); n != 1 {
		t.Fatalf("debía unirse 1 pedido, hay %d", n)
	}
	// Si después cambia de número, el pedido sigue siendo suyo.
	if _, err := base.Exec(`UPDATE usuarios SET celular=$2 WHERE id=$1`, uid, numeroLibre()); err != nil {
		t.Fatal(err)
	}
	if n := numero(t, `SELECT count(*) FROM pedidos WHERE comprador_id=$1`, uid); n != 1 {
		t.Fatal("el pedido debía seguir en su cuenta después de cambiar de número")
	}
}
