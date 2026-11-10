package pruebas

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/solanchveliz-dev/vendigo/api/internal/planes"
)

// Los créditos de IA extra se pagan a VendiGo solo con Culqi y se entregan recién cuando el cobro se aprueba.
func TestCreditosIASoloSeEntreganConCobroDeCulqi(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	tid := crearTienda(t)
	admin := crearUsuario(t, "admin")
	creditos := func() int {
		return numero(t, `SELECT COALESCE(SUM(cantidad), 0) FROM creditos_extra WHERE tienda_id=$1`, tid)
	}
	pedir := func() string {
		return texto(t, `INSERT INTO pagos_plan (tienda_id, concepto, monto_centimos, metodo, estado, tipo)
			VALUES ($1, '+100 créditos de IA', $2, 'culqi', 'pendiente', 'creditos_ia') RETURNING id::text`, tid, planes.PrecioCreditosIA)
	}

	// 1. Pedirlos no entrega nada.
	id := pedir()
	if n := creditos(); n != 0 {
		t.Fatalf("pedir créditos no debe entregarlos antes del pago (hay %d)", n)
	}

	// 2. El admin no puede confirmarlos a mano si no hubo un cobro de Culqi.
	err := intentar(t, func(tx *sql.Tx) error {
		_, err := planes.ConfirmarPago(ctx, tx, id, "12345678", admin, "")
		return err
	})
	if err == nil || !strings.Contains(err.Error(), "Culqi") {
		t.Errorf("confirmar sin cobro de Culqi debía rechazarse (error: %v)", err)
	}
	if n := creditos(); n != 0 {
		t.Errorf("sin cobro de Culqi no debe haber créditos (hay %d)", n)
	}

	// 3. Con el cobro aprobado por Culqi se suman los 100 créditos y el pago queda confirmado por Culqi.
	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := planes.ConfirmarPago(ctx, tx, id, "chr_prueba", "", "chr_prueba")
		return err
	})
	if n := creditos(); n != planes.PaqueteCreditosIA {
		t.Errorf("con el cobro aprobado debían sumarse %d créditos (hay %d)", planes.PaqueteCreditosIA, n)
	}
	if e := texto(t, `SELECT estado || '/' || metodo FROM pagos_plan WHERE id=$1`, id); e != "confirmado/culqi" {
		t.Errorf("el pago debía quedar confirmado por Culqi, quedó %s", e)
	}

	// 4. Si Culqi cobró pero no se llegó a aplicar, el admin sí puede confirmarlo con ese cobro.
	id2 := pedir()
	if _, err := base.Exec(`UPDATE pagos_plan SET referencia_tienda='chr_pendiente' WHERE id=$1`, id2); err != nil {
		t.Fatal(err)
	}
	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := planes.ConfirmarPago(ctx, tx, id2, "chr_pendiente", admin, "")
		return err
	})
	if n := creditos(); n != 2*planes.PaqueteCreditosIA {
		t.Errorf("tras confirmar el cobro pendiente de Culqi debían ser %d créditos (hay %d)", 2*planes.PaqueteCreditosIA, n)
	}
}

// Regla general: ningún cobro de VendiGo (plan, ventas extra, impulso o créditos) se activa sin un cobro de Culqi.
// Con el cobro aprobado se activa solo, sin que el admin confirme nada.
func TestCobrosDeVendiGoSoloSeActivanConCulqi(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	tid := crearTienda(t)
	admin := crearUsuario(t, "admin")
	ventas := func() int {
		return numero(t, `SELECT COALESCE(SUM(cantidad), 0) FROM ventas_extra WHERE tienda_id=$1`, tid)
	}
	id := texto(t, `INSERT INTO pagos_plan (tienda_id, concepto, monto_centimos, metodo, estado, tipo)
		VALUES ($1, '+20 ventas', 500, 'culqi', 'pendiente', 'ventas_extra') RETURNING id::text`, tid)

	// Un admin ya no puede activar a mano un pago sin cobro de Culqi (por ejemplo, un Yape informado).
	err := intentar(t, func(tx *sql.Tx) error {
		_, err := planes.ConfirmarPago(ctx, tx, id, "12345678", admin, "")
		return err
	})
	if err == nil || !strings.Contains(err.Error(), "Culqi") {
		t.Errorf("activar ventas extra sin cobro de Culqi debía rechazarse (error: %v)", err)
	}
	if n := ventas(); n != 0 {
		t.Errorf("sin cobro de Culqi no debe sumarse ninguna venta (hay %d)", n)
	}

	// Con el cobro de Culqi aprobado se suman solas.
	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := planes.ConfirmarPago(ctx, tx, id, "chr_ventas", "", "chr_ventas")
		return err
	})
	if n := ventas(); n != 20 {
		t.Errorf("con el cobro aprobado debían sumarse 20 ventas (hay %d)", n)
	}
}
