package admin

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/planes"
)

// Pagos de planes y ventas extra: aquí VendiGo SÍ es quien vende (su servicio), así que el dinero llega a su
// propia cuenta. Mientras no haya pasarela, la tienda paga por Yape y el admin confirma que lo recibió.

type PagoPlanAdmin struct {
	ID         string     `json:"id"`
	TiendaID   string     `json:"tienda_id"`
	Tienda     string     `json:"tienda"`
	Concepto   string     `json:"concepto"`
	Tipo       string     `json:"tipo"`
	Monto      int        `json:"monto_centimos"`
	Estado     string     `json:"estado"`
	Referencia string     `json:"referencia"`
	Motivo     string     `json:"motivo_rechazo"`
	CreadoEn   time.Time  `json:"creado_en"`
	Confirmado *time.Time `json:"confirmado_en"`
}

func (m *Modulo) pagosPlan(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT pp.id, t.id, t.nombre, pp.concepto, pp.tipo, pp.monto_centimos, pp.estado, pp.referencia, pp.motivo_rechazo,
		pp.creado_en, pp.confirmado_en FROM pagos_plan pp JOIN tiendas t ON t.id=pp.tienda_id
		ORDER BY pp.estado<>'pendiente', pp.creado_en DESC LIMIT 2000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []PagoPlanAdmin{}
	for rows.Next() {
		var p PagoPlanAdmin
		if err := rows.Scan(&p.ID, &p.TiendaID, &p.Tienda, &p.Concepto, &p.Tipo, &p.Monto, &p.Estado, &p.Referencia, &p.Motivo, &p.CreadoEn, &p.Confirmado); err != nil {
			return err
		}
		out = append(out, p)
	}
	httpx.OK(w, map[string]any{"pagos": out})
	return nil
}

func (m *Modulo) confirmarPagoPlan(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Referencia string `json:"referencia"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Referencia = strings.TrimSpace(in.Referencia)
	if len(in.Referencia) < 4 {
		return httpx.Invalido("Escribe el número de operación del Yape o transferencia que recibió VendiGo.")
	}
	id := chi.URLParam(r, "id")
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var tid, tipo, concepto string
		var planID sql.NullString
		var monto int
		err := tx.QueryRowContext(ctx, `UPDATE pagos_plan SET estado='confirmado', referencia=$2, confirmado_por=$3, confirmado_en=now()
			WHERE id::text=$1 AND estado='pendiente' RETURNING tienda_id, tipo, plan_id, monto_centimos, concepto`, id, in.Referencia, adminID(ctx)).
			Scan(&tid, &tipo, &planID, &monto, &concepto)
		if core.SinFilas(err) {
			return httpx.Conflicto("no_aplica", "Este pago ya fue revisado.")
		}
		if err != nil {
			return err
		}
		if tipo == "ventas_extra" {
			err = planes.AplicarVentasExtra(ctx, tx, tid, monto)
		} else {
			err = planes.AplicarPlan(ctx, tx, tid, planID.String, false, monto)
		}
		if err != nil {
			return err
		}
		billetera.Notificar(ctx, tx, tid, "Recibimos tu pago", concepto+": ya está activo. ¡Gracias!", "/vendedor/plan")
		m.app.Auditar(ctx, tx, adminID(ctx), "confirmar_pago_plan", "pago_plan", id, map[string]any{"referencia": in.Referencia, "monto": monto})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Pago confirmado. El plan ya está activo."})
	return nil
}

func (m *Modulo) rechazarPagoPlan(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	motivo, err := motivoObligatorio(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var tid, concepto string
		err := tx.QueryRowContext(ctx, `UPDATE pagos_plan SET estado='rechazado', motivo_rechazo=$2, confirmado_por=$3, confirmado_en=now()
			WHERE id::text=$1 AND estado='pendiente' RETURNING tienda_id, concepto`, id, motivo, adminID(ctx)).Scan(&tid, &concepto)
		if core.SinFilas(err) {
			return httpx.Conflicto("no_aplica", "Este pago ya fue revisado.")
		}
		if err != nil {
			return err
		}
		billetera.Notificar(ctx, tx, tid, "No encontramos tu pago", concepto+": "+motivo, "/vendedor/plan")
		m.app.Auditar(ctx, tx, adminID(ctx), "rechazar_pago_plan", "pago_plan", id, map[string]string{"motivo": motivo})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Pago rechazado. Le avisamos a la tienda."})
	return nil
}
