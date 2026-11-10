package admin

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
)

// cubierto: el fondo de emergencia cubre pedidos que no le llegaron al comprador
// (la tienda canceló después de cobrar, o VendiGo le dio la razón en un reclamo "no llegó").
const cubierto = `(d.origen = 'cancelacion' OR EXISTS (SELECT 1 FROM reclamos rc WHERE rc.pedido_id = p.id AND rc.motivo IN ('no_llego', 'pago_no_reconocido')))`

// El fondo es limitado y sujeto a revisión: el admin decide caso por caso si lo usa (no hay cobertura garantizada).
// Usarlo NO suspende la tienda ni le crea una deuda: suspenderla es otra decisión del admin, desde Tiendas.

// diasHabilesDesde cuenta los días hábiles (Perú) completos desde t hasta ahora.
func diasHabilesDesde(t time.Time) int {
	lima, _ := time.LoadLocation("America/Lima")
	d := t.In(lima).AddDate(0, 0, 1)
	hoy := time.Now().In(lima)
	n := 0
	for !d.After(hoy) {
		if billetera.EsDiaHabil(d) {
			n++
		}
		d = d.AddDate(0, 0, 1)
	}
	return n
}

// GET /admin/garantias: devoluciones vencidas que VendiGo puede cubrir y garantías ya pagadas.
func (m *Modulo) garantias(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	g := pagos.LeerGarantia(ctx, m.app.DB)
	type pendiente struct {
		PedidoID  string    `json:"pedido_id"`
		Codigo    string    `json:"codigo"`
		Tienda    string    `json:"tienda"`
		TiendaID  string    `json:"tienda_id"`
		Comprador string    `json:"comprador"`
		Celular   string    `json:"celular"`
		Origen    string    `json:"origen"`
		Monto     int       `json:"monto_centimos"`
		Cubre     int       `json:"cubre_centimos"`
		Desde     time.Time `json:"desde"`
		Dias      int       `json:"dias_habiles"`
		Vencida   bool      `json:"vencida"`
		Casos     int       `json:"casos_tienda"` // veces que el fondo ya cubrió a esta tienda
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, t.nombre, t.id, p.comprador_nombre, p.comprador_celular, d.origen, d.monto_centimos, d.creado_en,
		(SELECT count(*) FROM garantias gc WHERE gc.tienda_id=t.id)
		FROM devoluciones d JOIN pedidos p ON p.id=d.pedido_id JOIN tiendas t ON t.id=p.tienda_id
		WHERE d.estado='pendiente_tienda' AND `+cubierto+`
		AND NOT EXISTS (SELECT 1 FROM garantias gg WHERE gg.pedido_id=p.id) ORDER BY d.creado_en`)
	if err != nil {
		return err
	}
	pend := []pendiente{}
	for rows.Next() {
		var x pendiente
		if err := rows.Scan(&x.PedidoID, &x.Codigo, &x.Tienda, &x.TiendaID, &x.Comprador, &x.Celular, &x.Origen, &x.Monto, &x.Desde, &x.Casos); err != nil {
			rows.Close()
			return err
		}
		x.Dias = diasHabilesDesde(x.Desde)
		x.Vencida = x.Dias >= g.DiasHabiles
		x.Cubre = min(x.Monto, g.Tope)
		pend = append(pend, x)
	}
	rows.Close()

	type pagada struct {
		ID         string     `json:"id"`
		PedidoID   string     `json:"pedido_id"`
		Codigo     string     `json:"codigo"`
		Tienda     string     `json:"tienda"`
		TiendaID   string     `json:"tienda_id"`
		Suspendida bool       `json:"tienda_suspendida"`
		Casos      int        `json:"casos_tienda"`
		Monto      int        `json:"monto_centimos"`
		Estado     string     `json:"estado"` // pagada · recuperada (sistema anterior, cuando la tienda reponía)
		Referencia string     `json:"referencia"`
		PagadaEn   time.Time  `json:"pagada_en"`
		RecupRef   string     `json:"recuperada_ref"`
		RecupEn    *time.Time `json:"recuperada_en"`
	}
	rows, err = m.app.DB.QueryContext(ctx, `SELECT g.id, p.id, p.codigo, t.nombre, t.id, t.suspendida_garantia, (SELECT count(*) FROM garantias gc WHERE gc.tienda_id=t.id), g.monto_centimos, g.estado, g.referencia, g.pagada_en, g.recuperada_ref, g.recuperada_en
		FROM garantias g JOIN pedidos p ON p.id=g.pedido_id JOIN tiendas t ON t.id=g.tienda_id ORDER BY g.pagada_en DESC LIMIT 100`)
	if err != nil {
		return err
	}
	defer rows.Close()
	hechas := []pagada{}
	for rows.Next() {
		var x pagada
		if err := rows.Scan(&x.ID, &x.PedidoID, &x.Codigo, &x.Tienda, &x.TiendaID, &x.Suspendida, &x.Casos, &x.Monto, &x.Estado, &x.Referencia, &x.PagadaEn, &x.RecupRef, &x.RecupEn); err != nil {
			return err
		}
		hechas = append(hechas, x)
	}
	// Saldo del fondo (con todas las garantías, no solo las 100 que se listan):
	// aporte inicial + porcentaje de todo lo cobrado por VendiGo − lo devuelto a compradores.
	// Las garantías "recuperadas" del sistema anterior no se descuentan: la tienda las repuso.
	var pagadoTotal, devueltoNeto, ingresos, suspendidas, impulsosActivos int
	m.app.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(monto_centimos),0), COALESCE(SUM(monto_centimos) FILTER (WHERE estado='pagada'),0) FROM garantias`).
		Scan(&pagadoTotal, &devueltoNeto)
	m.app.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(monto_centimos),0) FROM pagos_plan WHERE estado='confirmado'`).Scan(&ingresos)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM tiendas WHERE suspendida_garantia`).Scan(&suspendidas)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM impulsos WHERE now() BETWEEN inicio AND fin`).Scan(&impulsosActivos)
	aporte := ingresos * g.Porcentaje / 100
	httpx.OK(w, map[string]any{
		"reglas": g, "pendientes": pend, "garantias": hechas,
		"resumen": map[string]int{"pagado_centimos": pagadoTotal, "ingresos_vendigo_centimos": ingresos, "aporte_centimos": aporte,
			"fondo_centimos": g.AporteInicial + aporte - devueltoNeto, "tiendas_suspendidas": suspendidas, "impulsos_activos": impulsosActivos},
	})
	return nil
}

// POST /admin/garantias/{pedido}/pagar: VendiGo ya le devolvió al comprador (de su fondo) y lo registra.
func (m *Modulo) pagarGarantia(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Referencia string `json:"referencia"`
		Nota       string `json:"nota"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Referencia, in.Nota = strings.TrimSpace(in.Referencia), strings.TrimSpace(in.Nota)
	if len(in.Referencia) < 4 {
		return httpx.Invalido("Escribe el número de operación con el que VendiGo le devolvió al comprador.")
	}
	g := pagos.LeerGarantia(ctx, m.app.DB)
	pid := chi.URLParam(r, "pedido")
	var monto int
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var tid, devID, codigo string
		var desde time.Time
		err := tx.QueryRowContext(ctx, `SELECT d.id, p.tienda_id, p.codigo, d.monto_centimos, d.creado_en FROM devoluciones d JOIN pedidos p ON p.id=d.pedido_id
			WHERE d.pedido_id::text=$1 AND d.estado='pendiente_tienda' AND `+cubierto+`
			AND NOT EXISTS (SELECT 1 FROM garantias gg WHERE gg.pedido_id=p.id) ORDER BY d.creado_en LIMIT 1 FOR UPDATE OF d`, pid).Scan(&devID, &tid, &codigo, &monto, &desde)
		if core.SinFilas(err) {
			return httpx.Conflicto("no_aplica", "Este pedido no está cubierto: el fondo solo cubre pedidos que no llegaron.")
		}
		if err != nil {
			return err
		}
		if diasHabilesDesde(desde) < g.DiasHabiles {
			return httpx.Conflicto("a_tiempo", fmt.Sprintf("La tienda todavía tiene plazo: son %d días hábiles.", g.DiasHabiles))
		}
		total := monto
		monto = min(monto, g.Tope)
		if _, err := tx.ExecContext(ctx, `INSERT INTO garantias (pedido_id, tienda_id, monto_centimos, referencia, nota, pagada_por) VALUES ($1,$2,$3,$4,$5,$6)`,
			pid, tid, monto, in.Referencia, in.Nota, adminID(ctx)); err != nil {
			return err
		}
		nota := fmt.Sprintf("Fondo de emergencia: VendiGo devolvió S/ %.2f al comprador.", float64(monto)/100)
		aComprador := fmt.Sprintf("VendiGo te devolvió S/ %.2f del pedido %s con su fondo de emergencia.", float64(monto)/100, codigo)
		if total > monto {
			// El fondo tiene tope: cubre solo una parte. No se registra una deuda de la tienda; el comprador puede
			// seguir el resto por el Libro de Reclamaciones.
			nota += fmt.Sprintf(" Monto no cubierto por el fondo: S/ %.2f.", float64(total-monto)/100)
			aComprador += " Por el resto puedes seguir tu caso en el Libro de Reclamaciones."
		}
		if _, err := tx.ExecContext(ctx, `UPDATE devoluciones SET estado='cubierta_vendigo', nota=$2, informada_en=now() WHERE id=$1`, devID, nota); err != nil {
			return err
		}
		billetera.Notificar(ctx, tx, tid, "VendiGo cubrió una devolución de tu tienda",
			fmt.Sprintf("No informaste a tiempo la devolución del pedido %s y VendiGo le devolvió S/ %.2f al comprador con su fondo de emergencia. "+
				"El equipo de VendiGo revisará el caso. Si crees que es un error, escríbenos desde Ayuda.", codigo, float64(monto)/100),
			"/vendedor/pedidos/"+pid)
		billetera.SMSComprador(ctx, tx, pid, aComprador)
		m.app.Auditar(ctx, tx, adminID(ctx), "pagar_garantia", "pedido", pid, map[string]any{"monto": monto, "referencia": in.Referencia})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": fmt.Sprintf("Devolución registrada: S/ %.2f del fondo de emergencia. Si corresponde suspender la tienda, hazlo desde Tiendas.", float64(monto)/100)})
	return nil
}

// POST /admin/garantias/{id}/reactivar {motivo}: el admin revisó el caso y reactiva la tienda suspendida.
// Ya no se le pide a la tienda reponer el dinero: lo cubre el fondo de emergencia de VendiGo.
func (m *Modulo) reactivarTiendaFondo(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	motivo, err := motivoObligatorio(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var tid string
		err := tx.QueryRowContext(ctx, `UPDATE tiendas t SET suspendida_garantia=false FROM garantias g
			WHERE g.id::text=$1 AND t.id=g.tienda_id AND t.suspendida_garantia RETURNING t.id`, id).Scan(&tid)
		if core.SinFilas(err) {
			return httpx.Conflicto("no_aplica", "Esta tienda ya está activa.")
		}
		if err != nil {
			return err
		}
		billetera.Notificar(ctx, tx, tid, "Tu tienda está activa de nuevo",
			"El equipo de VendiGo revisó el caso y reactivó tu tienda: "+motivo+".", "/vendedor")
		m.app.Auditar(ctx, tx, adminID(ctx), "reactivar_tienda_fondo", "garantia", id, map[string]any{"motivo": motivo})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Tienda reactivada. Ya puede recibir pedidos."})
	return nil
}
