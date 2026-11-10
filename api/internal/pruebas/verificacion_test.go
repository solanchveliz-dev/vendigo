package pruebas

import (
	"context"
	"database/sql"
	"testing"

	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

// verificar registra una verificación aprobada de la tienda: "identidad" (DNI) o "negocio" (RUC).
func verificar(t *testing.T, tid, clase string) {
	t.Helper()
	tipo, selfie := "dni", any("dni/selfie")
	if clase == "negocio" {
		tipo, selfie = "ruc", nil
	}
	if _, err := base.Exec(`INSERT INTO verificaciones (tienda_id, tipo_documento, numero_cifrado, ultimos4, nombre_completo, frente_key, selfie_key, estado, clase)
		VALUES ($1, $2, 'x', '1234', 'Nombre de prueba', 'dni/frente', $3, 'aprobada', $4)`, tid, tipo, selfie, clase); err != nil {
		t.Fatalf("verificar %s: %v", clase, err)
	}
}

func estadoTienda(t *testing.T, tid string) (identidad, ruc bool, bloqueo string) {
	t.Helper()
	if err := base.QueryRow(`SELECT tienda_identidad_verificada(id), tienda_ruc_verificado(id), COALESCE(tienda_reclamo_bloqueante(id), '') FROM tiendas WHERE id=$1`, tid).
		Scan(&identidad, &ruc, &bloqueo); err != nil {
		t.Fatal(err)
	}
	return
}

// Una tienda se muestra a los compradores solo con la identidad (DNI) aprobada por el admin.
// El RUC solo da la insignia: no reemplaza al DNI.
func TestTiendaVisibleSoloConIdentidadAprobada(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	if id, ruc, _ := estadoTienda(t, tid); id || ruc {
		t.Fatalf("una tienda nueva no debe estar verificada (identidad %v, ruc %v)", id, ruc)
	}
	verificar(t, tid, "negocio")
	if id, ruc, _ := estadoTienda(t, tid); id || !ruc {
		t.Errorf("con solo el RUC aprobado la tienda debe seguir oculta y con insignia de RUC (identidad %v, ruc %v)", id, ruc)
	}
	verificar(t, tid, "identidad")
	if id, _, _ := estadoTienda(t, tid); !id {
		t.Errorf("con el DNI aprobado la tienda debe mostrarse")
	}
}

// Un reclamo solo no detiene la tienda: deja de recibir pedidos únicamente si no responde en 48 h, y vuelve sola
// al responder. Si VendiGo, después de revisar, le da la razón al comprador, sigue en pausa hasta informar la devolución.
func TestReclamoPausaSoloSiLaTiendaNoResponde(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	admin := crearUsuario(t, "admin")
	tid := crearTienda(t)
	verificar(t, tid, "identidad")

	p1 := crearPedido(t, tid, "enviado", "informado_tienda", 2)
	r1 := abrirReclamo(t, p1, "no_llego")
	if _, _, b := estadoTienda(t, tid); b != "" {
		t.Fatalf("un reclamo recién abierto no debe pausar la tienda (bloqueo %q)", b)
	}
	if n := numero(t, `SELECT count(*) FROM garantias WHERE pedido_id=$1`, p1); n != 0 {
		t.Errorf("el fondo no debe pagar antes de que el admin revise el caso")
	}

	// Pasan 48 h sin respuesta: el caso pasa a VendiGo y la tienda queda en pausa.
	if _, err := base.Exec(`UPDATE reclamos SET creado_en = now() - interval '49 hours' WHERE id=$1`, r1); err != nil {
		t.Fatal(err)
	}
	if err := pedidos.EscalarReclamos(ctx, app); err != nil {
		t.Fatal(err)
	}
	if e := texto(t, `SELECT estado FROM reclamos WHERE id=$1`, r1); e != "en_revision" {
		t.Errorf("sin respuesta en 48 h el reclamo debía pasar a revisión de VendiGo (estado %q)", e)
	}
	if _, _, b := estadoTienda(t, tid); b != p1 {
		t.Fatalf("sin respuesta en 48 h la tienda debía quedar en pausa por ese pedido (bloqueo %q)", b)
	}
	// La tienda responde: la pausa se levanta sola, aunque el caso siga en revisión.
	if _, err := base.Exec(`UPDATE reclamos SET respondido_en = now(), respuesta_vendedor='Envié el pedido, adjunto la guía.' WHERE id=$1`, r1); err != nil {
		t.Fatal(err)
	}
	if _, _, b := estadoTienda(t, tid); b != "" {
		t.Errorf("al responder, la pausa debía levantarse sola (bloqueo %q)", b)
	}
	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := pedidos.ResolverReclamo(ctx, app, tx, r1, "vendedor", "La guía de envío muestra que se entregó.", admin)
		return err
	})

	// A favor del comprador tras la revisión: en pausa hasta que la tienda informe la devolución.
	p2 := crearPedido(t, tid, "enviado", "informado_tienda", 2)
	r2 := abrirReclamo(t, p2, "no_llego")
	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := pedidos.ResolverReclamo(ctx, app, tx, r2, "comprador", "No hay prueba de envío del pedido.", admin)
		return err
	})
	if _, _, b := estadoTienda(t, tid); b != p2 {
		t.Errorf("con el reclamo a favor del comprador y sin devolver, la tienda debía seguir en pausa (bloqueo %q)", b)
	}
	if _, err := base.Exec(`UPDATE devoluciones SET estado='informada_tienda', evidencia_key='devolucion/x' WHERE pedido_id=$1`, p2); err != nil {
		t.Fatal(err)
	}
	if _, _, b := estadoTienda(t, tid); b != "" {
		t.Errorf("al informar la devolución la pausa debía levantarse sola (bloqueo %q)", b)
	}
}
