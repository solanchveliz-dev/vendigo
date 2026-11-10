// Package pruebas comprueba contra PostgreSQL que VendiGo no custodia dinero:
// solo un proveedor confirma pagos, el archivo histórico es de solo lectura, las devoluciones se abren
// al cancelar o al perder un reclamo, la confirmación de 7 días no mueve dinero y los planes van aparte.
//
// Usa una base propia llamada vendigo_pruebas que se borra y se crea en cada ejecución: nunca toca
// la base de desarrollo. Toma el servidor de DATABASE_URL_PRUEBAS, DATABASE_URL o api/.env.
// Si no hay PostgreSQL disponible, las pruebas se saltan (go test -v muestra el motivo).
package pruebas

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/config"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/db"
	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

const nombreBase = "vendigo_pruebas"

var (
	base     *sql.DB
	app      *core.App
	motivo   string
	contador int
)

func TestMain(m *testing.M) {
	ctx := context.Background()
	conn, err := prepararBase(ctx)
	if err != nil {
		motivo = err.Error()
	} else {
		base = conn
		app = &core.App{Cfg: config.Config{Entorno: "test"}, DB: conn}
	}
	codigo := m.Run()
	if base != nil {
		base.Close()
	}
	os.Exit(codigo)
}

// urlServidor: de dónde sale el servidor PostgreSQL de pruebas.
func urlServidor() string {
	if u := os.Getenv("DATABASE_URL_PRUEBAS"); u != "" {
		return u
	}
	if u := os.Getenv("DATABASE_URL"); u != "" {
		return u
	}
	f, err := os.ReadFile("../../.env")
	if err != nil {
		return ""
	}
	for _, l := range strings.Split(string(f), "\n") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(l), "DATABASE_URL="); ok {
			return strings.Trim(strings.TrimSpace(v), `"'`)
		}
	}
	return ""
}

// prepararBase crea desde cero la base vendigo_pruebas y le aplica todas las migraciones.
func prepararBase(ctx context.Context) (*sql.DB, error) {
	origen := urlServidor()
	if origen == "" {
		return nil, errors.New("no hay DATABASE_URL: levanta docker compose y crea api/.env")
	}
	u, err := url.Parse(origen)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL no es válida: %w", err)
	}
	c, cancelar := context.WithTimeout(ctx, 5*time.Second)
	defer cancelar()
	servidor, err := db.Conectar(c, origen)
	if err != nil {
		return nil, err
	}
	defer servidor.Close()
	if _, err := servidor.ExecContext(ctx, `DROP DATABASE IF EXISTS `+nombreBase+` WITH (FORCE)`); err != nil {
		return nil, fmt.Errorf("no se pudo borrar %s: %w", nombreBase, err)
	}
	if _, err := servidor.ExecContext(ctx, `CREATE DATABASE `+nombreBase); err != nil {
		return nil, fmt.Errorf("no se pudo crear %s: %w", nombreBase, err)
	}
	u.Path = "/" + nombreBase
	conn, err := db.Conectar(ctx, u.String())
	if err != nil {
		return nil, err
	}
	if err := db.Migrar(ctx, conn); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migraciones: %w", err)
	}
	return conn, nil
}

/* ---------- ayudas ---------- */

func necesitaBase(t *testing.T) {
	t.Helper()
	if base == nil {
		t.Skip("sin base de datos de pruebas: " + motivo)
	}
}

func siguiente() int {
	contador++
	return contador
}

func crearUsuario(t *testing.T, rol string) string {
	t.Helper()
	var id string
	n := siguiente()
	if err := base.QueryRow(`INSERT INTO usuarios (nombre, celular, password_hash, rol) VALUES ($1, $2, 'x', $3) RETURNING id::text`,
		fmt.Sprintf("Usuario %d", n), fmt.Sprintf("9%08d", n), rol).Scan(&id); err != nil {
		t.Fatalf("crear usuario: %v", err)
	}
	return id
}

func crearTienda(t *testing.T) string {
	t.Helper()
	uid := crearUsuario(t, "vendedor")
	var id string
	if err := base.QueryRow(`INSERT INTO tiendas (usuario_id, nombre, slug, rubro, ciudad) VALUES ($1, 'Tienda de prueba', $2, 'moda', 'Lima') RETURNING id::text`,
		uid, fmt.Sprintf("prueba-%d", siguiente())).Scan(&id); err != nil {
		t.Fatalf("crear tienda: %v", err)
	}
	return id
}

// crearPedido: pedido por agencia de S/ 50.00, enviado hace `dias`, con su pago en `estadoPago`.
func crearPedido(t *testing.T, tid, estado, estadoPago string, dias int) string {
	t.Helper()
	ctx := context.Background()
	tx, err := base.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	var pid string
	if err := tx.QueryRowContext(ctx, `INSERT INTO pedidos (tienda_id, comprador_nombre, comprador_celular, entrega, metodo_pago, pago_estado,
		subtotal_centimos, total_centimos, estado, enviado_en)
		VALUES ($1, 'Comprador', '988000111', 'agencia', 'yape_directo', 'pendiente', 5000, 5000, $2, now() - make_interval(days => $3::int))
		RETURNING id::text`, tid, estado, dias).Scan(&pid); err != nil {
		t.Fatalf("crear pedido: %v", err)
	}
	if err := pagos.Registrar(ctx, tx, pid, "yape_directo", "antes", 5000, 0, false); err != nil {
		t.Fatalf("registrar pago: %v", err)
	}
	if estadoPago != "pendiente" {
		if _, err := tx.ExecContext(ctx, `UPDATE pagos SET estado=$2 WHERE pedido_id=$1`, pid, estadoPago); err != nil {
			t.Fatalf("estado del pago: %v", err)
		}
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	return pid
}

// enTransaccion ejecuta fn y confirma; falla la prueba si hay error.
func enTransaccion(t *testing.T, fn func(tx *sql.Tx) error) {
	t.Helper()
	if err := app.EnTransaccion(context.Background(), fn); err != nil {
		t.Fatal(err)
	}
}

// intentar ejecuta fn en una transacción que siempre se deshace y devuelve su error.
func intentar(t *testing.T, fn func(tx *sql.Tx) error) error {
	t.Helper()
	tx, err := base.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	return fn(tx)
}

func texto(t *testing.T, consulta string, args ...any) string {
	t.Helper()
	var v sql.NullString
	if err := base.QueryRow(consulta, args...).Scan(&v); err != nil && !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("%s: %v", consulta, err)
	}
	return v.String
}

func numero(t *testing.T, consulta string, args ...any) int {
	t.Helper()
	var n int
	if err := base.QueryRow(consulta, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", consulta, err)
	}
	return n
}

func abrirReclamo(t *testing.T, pid, motivo string) string {
	t.Helper()
	ctx := context.Background()
	enTransaccion(t, func(tx *sql.Tx) error { return pedidos.AbrirReclamo(ctx, tx, pid, motivo, "Prueba automática", nil) })
	return texto(t, `SELECT id::text FROM reclamos WHERE pedido_id=$1`, pid)
}

/* ---------- pruebas ---------- */

// Solo un proveedor de pagos puede dejar un pago confirmado, rechazado o reembolsado: lo exige la base de datos.
func TestSoloUnProveedorConfirmaElPago(t *testing.T) {
	necesitaBase(t)
	pid := crearPedido(t, crearTienda(t), "por_aceptar", "pendiente", 0)
	casos := []struct {
		origen, estado string
		permitido      bool
	}{
		{"tienda", "confirmado", false},
		{"tienda", "rechazado", false},
		{"tienda", "reembolsado", false},
		{"tienda", "informado_tienda", true},
		{"proveedor", "confirmado", true},
		{"proveedor", "reembolsado", true},
	}
	for _, c := range casos {
		err := intentar(t, func(tx *sql.Tx) error {
			_, err := tx.Exec(`UPDATE pagos SET origen=$2, estado=$3 WHERE pedido_id=$1`, pid, c.origen, c.estado)
			return err
		})
		switch {
		case c.permitido && err != nil:
			t.Errorf("origen %s, estado %s: debía permitirse, pero falló: %v", c.origen, c.estado, err)
		case !c.permitido && err == nil:
			t.Errorf("origen %s, estado %s: la base debió rechazarlo", c.origen, c.estado)
		case !c.permitido && !strings.Contains(err.Error(), "pagos_confirmado_por_proveedor"):
			t.Errorf("origen %s, estado %s: falló por otro motivo: %v", c.origen, c.estado, err)
		}
	}
}

// Los saldos, liberaciones y retiros del modelo anterior quedan en un archivo que no se puede modificar.
func TestArchivoHistoricoDeSoloLectura(t *testing.T) {
	necesitaBase(t)
	for _, tabla := range []string{"movimientos_archivo", "retiros_archivo"} {
		err := intentar(t, func(tx *sql.Tx) error {
			_, err := tx.Exec(`INSERT INTO ` + tabla + ` DEFAULT VALUES`)
			return err
		})
		if err == nil || !strings.Contains(err.Error(), "solo lectura") {
			t.Errorf("%s: se pudo escribir en el archivo (error: %v)", tabla, err)
		}
	}

	pid := crearPedido(t, crearTienda(t), "entregado", "informado_tienda", 0)
	for _, cambio := range []string{
		`UPDATE pedidos_finanzas_archivo SET liberado = true WHERE pedido_id = $1`,
		`DELETE FROM pedidos_finanzas_archivo WHERE pedido_id = $1`,
	} {
		err := intentar(t, func(tx *sql.Tx) error {
			// Se prepara una fila con el permiso especial de archivado y luego se quita ese permiso.
			if _, err := tx.Exec(`SELECT set_config('vendigo.archivar', 'si', true)`); err != nil {
				return err
			}
			if _, err := tx.Exec(`INSERT INTO pedidos_finanzas_archivo (pedido_id, liberado, comision_estimada_centimos) VALUES ($1, false, 350)`, pid); err != nil {
				return fmt.Errorf("preparar fila: %w", err)
			}
			if _, err := tx.Exec(`SELECT set_config('vendigo.archivar', 'no', true)`); err != nil {
				return err
			}
			_, err := tx.Exec(cambio, pid)
			return err
		})
		if err == nil || !strings.Contains(err.Error(), "solo lectura") {
			t.Errorf("%q: se pudo modificar el archivo (error: %v)", cambio, err)
		}
	}
}

// Si la tienda cancela un pedido que ya cobró, queda una devolución pendiente a cargo de la tienda.
// Si el comprador todavía no pagó, no hay nada que devolver.
func TestCancelarAbreDevolucionSoloSiHuboPago(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	tid := crearTienda(t)
	casos := []struct {
		estadoPago string
		devuelve   bool
	}{
		{"informado_tienda", true},
		{"comprobante_enviado", true},
		{"pendiente", false},
		{"paga_al_recibir", false},
	}
	for _, c := range casos {
		pid := crearPedido(t, tid, "preparando", c.estadoPago, 0)
		var devuelve bool
		enTransaccion(t, func(tx *sql.Tx) error {
			var err error
			devuelve, err = pagos.AbrirDevolucion(ctx, tx, pid, "cancelacion")
			return err
		})
		filas := numero(t, `SELECT count(*) FROM devoluciones WHERE pedido_id=$1 AND origen='cancelacion' AND estado='pendiente_tienda' AND monto_centimos=5000`, pid)
		if devuelve != c.devuelve || (filas == 1) != c.devuelve {
			t.Errorf("pago %s: devolución esperada %v, obtenida %v (%d filas)", c.estadoPago, c.devuelve, devuelve, filas)
		}
		if e := texto(t, `SELECT estado FROM pagos WHERE pedido_id=$1`, pid); e != c.estadoPago {
			t.Errorf("pago %s: VendiGo no debe cambiar el pago al abrir la devolución (quedó %s)", c.estadoPago, e)
		}
	}
}

// Reclamo a favor del comprador: el pedido se cancela y la tienda debe devolver. VendiGo no mueve el pago.
func TestReclamoAFavorDelCompradorAbreDevolucion(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	admin := crearUsuario(t, "admin")
	pid := crearPedido(t, crearTienda(t), "enviado", "informado_tienda", 2)
	rid := abrirReclamo(t, pid, "no_llego")

	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := pedidos.ResolverReclamo(ctx, app, tx, rid, "comprador", "Las pruebas muestran que el pedido no llegó.", admin)
		return err
	})
	if e := texto(t, `SELECT estado FROM pedidos WHERE id=$1`, pid); e != "cancelado" {
		t.Errorf("el pedido debía quedar cancelado, quedó %s", e)
	}
	if n := numero(t, `SELECT count(*) FROM devoluciones WHERE pedido_id=$1 AND origen='reclamo' AND estado='pendiente_tienda' AND monto_centimos=5000`, pid); n != 1 {
		t.Errorf("debía quedar 1 devolución pendiente de la tienda, hay %d", n)
	}
	if e := texto(t, `SELECT estado FROM pagos WHERE pedido_id=$1`, pid); e != "informado_tienda" {
		t.Errorf("VendiGo no debe cambiar el pago, quedó %s", e)
	}
}

// Reclamo a favor de la tienda: el pedido queda entregado (antes se quedaba "enviado" para siempre).
func TestReclamoAFavorDeLaTiendaDejaElPedidoEntregado(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	admin := crearUsuario(t, "admin")
	pid := crearPedido(t, crearTienda(t), "enviado", "informado_tienda", 2)
	rid := abrirReclamo(t, pid, "danado")

	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := pedidos.ResolverReclamo(ctx, app, tx, rid, "vendedor", "La boleta de envío muestra que llegó en buen estado.", admin)
		return err
	})
	if e := texto(t, `SELECT estado || '/' || COALESCE(confirmado_por, '') FROM pedidos WHERE id=$1`, pid); e != "entregado/vendigo" {
		t.Errorf("el pedido debía quedar entregado por VendiGo, quedó %s", e)
	}
	if n := numero(t, `SELECT count(*) FROM devoluciones WHERE pedido_id=$1`, pid); n != 0 {
		t.Errorf("no debía abrirse ninguna devolución, hay %d", n)
	}
}

// La confirmación automática da por recibidos los envíos de más de 7 días sin reclamo y no toca el dinero.
func TestConfirmacionAutomaticaNoMueveDinero(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	tid := crearTienda(t)
	vencido := crearPedido(t, tid, "enviado", "informado_tienda", 8)
	reciente := crearPedido(t, tid, "enviado", "informado_tienda", 2)
	conReclamo := crearPedido(t, tid, "enviado", "informado_tienda", 8)
	abrirReclamo(t, conReclamo, "no_llego")

	movimientos := func() int {
		if texto(t, `SELECT to_regclass('public.movimientos')::text`) == "" {
			return 0 // la tabla antigua ya se retiró
		}
		return numero(t, `SELECT count(*) FROM movimientos`)
	}
	antesMov := movimientos()
	antesEventos := numero(t, `SELECT count(*) FROM pago_eventos e JOIN pagos g ON g.id=e.pago_id WHERE g.pedido_id=$1`, vencido)

	if _, err := pedidos.Barrer(ctx, app); err != nil {
		t.Fatal(err)
	}

	if e := texto(t, `SELECT estado || '/' || COALESCE(confirmado_por, '') FROM pedidos WHERE id=$1`, vencido); e != "entregado/automatico" {
		t.Errorf("el envío de 8 días debía darse por recibido, quedó %s", e)
	}
	for nombre, pid := range map[string]string{"reciente": reciente, "con reclamo": conReclamo} {
		if e := texto(t, `SELECT estado FROM pedidos WHERE id=$1`, pid); e != "enviado" {
			t.Errorf("el pedido %s no debía tocarse, quedó %s", nombre, e)
		}
	}
	if e := texto(t, `SELECT estado FROM pagos WHERE pedido_id=$1`, vencido); e != "informado_tienda" {
		t.Errorf("confirmar la entrega no debe cambiar el pago, quedó %s", e)
	}
	if n := numero(t, `SELECT count(*) FROM pago_eventos e JOIN pagos g ON g.id=e.pago_id WHERE g.pedido_id=$1`, vencido); n != antesEventos {
		t.Errorf("confirmar la entrega no debe registrar movimientos del pago (%d → %d)", antesEventos, n)
	}
	if n := movimientos(); n != antesMov {
		t.Errorf("no debe escribirse en el libro de movimientos antiguo (%d → %d)", antesMov, n)
	}
}

// Los pagos de planes (dinero de VendiGo) no están ligados a los pagos de las ventas (dinero de las tiendas).
func TestPlanesSeparadosDeLasVentas(t *testing.T) {
	necesitaBase(t)
	enlaces := numero(t, `SELECT count(*) FROM information_schema.referential_constraints rc
		JOIN information_schema.table_constraints origen ON origen.constraint_name = rc.constraint_name
		JOIN information_schema.table_constraints destino ON destino.constraint_name = rc.unique_constraint_name
		WHERE (origen.table_name = 'pagos_plan' AND destino.table_name IN ('pagos', 'pedidos', 'devoluciones'))
		   OR (origen.table_name IN ('pagos', 'pedidos', 'devoluciones') AND destino.table_name = 'pagos_plan')`)
	if enlaces != 0 {
		t.Errorf("los pagos de planes no deben estar ligados a las ventas (%d llaves foráneas)", enlaces)
	}
	if n := numero(t, `SELECT count(*) FROM information_schema.columns WHERE table_name = 'pagos_plan' AND column_name IN ('pedido_id', 'pago_id')`); n != 0 {
		t.Errorf("pagos_plan no debe tener columnas de pedidos o pagos de ventas")
	}
}
