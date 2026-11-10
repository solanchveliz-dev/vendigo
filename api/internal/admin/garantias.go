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
const cubierto = `(d.origen = 'cancelacion' OR EXISTS (SELECT 1 FROM reclamos rc WHERE rc.pedido_id = p.id AND rc.motivo = 'no_llego'))`

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
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, t.nombre, t.id, p.comprador_nombre, p.comprador_celular, d.origen, d.monto_centimos, d.creado_en
		FROM devoluciones d JOIN pedidos p ON p.id=d.pedido_id JOIN tiendas t ON t.id=p.tienda_id
		WHERE d.estado='pendiente_tienda' AND `+cubierto+` ORDER BY d.creado_en`)
	if err != nil {
		return err
	}
	pend := []pendiente{}
	for rows.Next() {
		var x pendiente
		if err := rows.Scan(&x.PedidoID, &x.Codigo, &x.Tienda, &x.TiendaID, &x.Comprador, &x.Celular, &x.Origen, &x.Monto, &x.Desde); err != nil {
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
		Monto      int        `json:"monto_centimos"`
		Estado     string     `json:"estado"`
		Referencia string     `json:"referencia"`
		PagadaEn   time.Time  `json:"pagada_en"`
		RecupRef   string     `json:"recuperada_ref"`
		RecupEn    *time.Time `json:"recuperada_en"`
	}
	rows, err = m.app.DB.QueryContext(ctx, `SELECT g.id, p.id, p.codigo, t.nombre, g.monto_centimos, g.estado, g.referencia, g.pagada_en, g.recuperada_ref, g.recuperada_en
		FROM garantias g JOIN pedidos p ON p.id=g.pedido_id JOIN tiendas t ON t.id=g.tienda_id ORDER BY g.pagada_en DESC LIMIT 100`)
	if err != nil {
		return err
	}
	defer rows.Close()
	hechas := []pagada{}
	var porRecuperar, pagadoTotal int
	for rows.Next() {
		var x pagada
		if err := rows.Scan(&x.ID, &x.PedidoID, &x.Codigo, &x.Tienda, &x.Monto, &x.Estado, &x.Referencia, &x.PagadaEn, &x.RecupRef, &x.RecupEn); err != nil {
			return err
		}
		pagadoTotal += x.Monto
		if x.Estado == "pagada" {
			porRecuperar += x.Monto
		}
		hechas = append(hechas, x)
	}
	var ingresosDestacados, impulsosActivos int
	m.app.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(monto_centimos),0) FROM pagos_plan WHERE tipo='destacado' AND estado='confirmado'`).Scan(&ingresosDestacados)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM impulsos WHERE now() BETWEEN inicio AND fin`).Scan(&impulsosActivos)
	httpx.OK(w, map[string]any{
		"reglas": g, "pendientes": pend, "garantias": hechas,
		"resumen": map[string]int{"pagado_centimos": pagadoTotal, "por_recuperar_centimos": porRecuperar, "ingresos_destacados_centimos": ingresosDestacados,
			"fondo_centimos": ingresosDestacados - porRecuperar, "impulsos_activos": impulsosActivos},
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
			WHERE d.pedido_id::text=$1 AND d.estado='pendiente_tienda' AND `+cubierto+` ORDER BY d.creado_en LIMIT 1 FOR UPDATE OF d`, pid).Scan(&devID, &tid, &codigo, &monto, &desde)
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
		if total > monto {
			nota += fmt.Sprintf(" La tienda aún debe S/ %.2f al comprador.", float64(total-monto)/100)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE devoluciones SET estado='cubierta_vendigo', nota=$2, informada_en=now() WHERE id=$1`, devID, nota); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE tiendas SET suspendida_garantia=true WHERE id=$1`, tid); err != nil {
			return err
		}
		billetera.Notificar(ctx, tx, tid, "Tu tienda está suspendida",
			fmt.Sprintf("No devolviste el dinero del pedido %s a tiempo y VendiGo le devolvió S/ %.2f al comprador. Repón ese monto a VendiGo para volver a recibir pedidos.", codigo, float64(monto)/100),
			"/vendedor/cobros")
		m.app.Auditar(ctx, tx, adminID(ctx), "pagar_garantia", "pedido", pid, map[string]any{"monto": monto, "referencia": in.Referencia})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": fmt.Sprintf("Devolución registrada: S/ %.2f. La tienda quedó suspendida hasta reponerlo.", float64(monto)/100)})
	return nil
}

// POST /admin/garantias/{id}/recuperar: la tienda repuso a VendiGo el monto de la garantía.
func (m *Modulo) recuperarGarantia(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Referencia string `json:"referencia"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Referencia = strings.TrimSpace(in.Referencia)
	if len(in.Referencia) < 4 {
		return httpx.Invalido("Escribe el número de operación con el que la tienda repuso el monto.")
	}
	id := chi.URLParam(r, "id")
	var reactivada bool
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var tid string
		err := tx.QueryRowContext(ctx, `UPDATE garantias SET estado='recuperada', recuperada_ref=$2, recuperada_en=now()
			WHERE id::text=$1 AND estado='pagada' RETURNING tienda_id`, id, in.Referencia).Scan(&tid)
		if core.SinFilas(err) {
			return httpx.Conflicto("no_aplica", "Esta garantía ya fue recuperada.")
		}
		if err != nil {
			return err
		}
		var otras bool
		tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM garantias WHERE tienda_id=$1 AND estado='pagada')`, tid).Scan(&otras)
		if !otras {
			if _, err := tx.ExecContext(ctx, `UPDATE tiendas SET suspendida_garantia=false WHERE id=$1`, tid); err != nil {
				return err
			}
			reactivada = true
			billetera.Notificar(ctx, tx, tid, "Tu tienda está activa de nuevo", "Recibimos tu pago. Ya puedes recibir pedidos.", "/vendedor")
		}
		m.app.Auditar(ctx, tx, adminID(ctx), "recuperar_garantia", "garantia", id, map[string]any{"referencia": in.Referencia})
		return nil
	})
	if err != nil {
		return err
	}
	msg := "Monto recuperado."
	if reactivada {
		msg += " La tienda ya puede recibir pedidos."
	}
	httpx.OK(w, map[string]string{"mensaje": msg})
	return nil
}
