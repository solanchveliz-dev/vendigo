package planes

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

type Modulo struct{ app *core.App }

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

const (
	paqueteVentas = 20
	paquetePrecio = 500 // S/ 5
)

func (m *Modulo) RutasPublicas(r chi.Router) {
	r.Method("GET", "/planes", httpx.Handler(m.listar))
}

func (m *Modulo) RutasVendedor(r chi.Router) {
	r.Method("GET", "/plan", httpx.Handler(m.actual))
	r.Method("POST", "/plan", httpx.Handler(m.cambiar))
	r.Method("POST", "/plan/ventas-extra", httpx.Handler(m.comprarExtra))
	r.Method("GET", "/plan/pagos", httpx.Handler(m.pagos))
	r.Method("POST", "/plan/pagos/{id}/informar", httpx.Handler(m.informarPago))
	r.Method("POST", "/plan/pagos/{id}/culqi", httpx.Handler(m.pagarConCulqi))
	r.Method("GET", "/destacados", httpx.Handler(m.destacados))
	r.Method("POST", "/productos/{id}/destacar", httpx.Handler(m.destacar))
}

type Plan struct {
	ID           string `json:"id"`
	Nombre       string `json:"nombre"`
	Precio       int    `json:"precio_centimos"`
	VentasMes    *int   `json:"ventas_mes"`
	CreditosIA   int    `json:"creditos_ia"`
	ProductosMax *int   `json:"productos_max"`
}

func (m *Modulo) leerPlanes(ctx context.Context) ([]Plan, error) {
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id, nombre, precio_centimos, ventas_mes, creditos_ia, productos_max FROM planes WHERE disponible ORDER BY orden`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Plan{}
	for rows.Next() {
		var p Plan
		rows.Scan(&p.ID, &p.Nombre, &p.Precio, &p.VentasMes, &p.CreditosIA, &p.ProductosMax)
		out = append(out, p)
	}
	return out, nil
}

func (m *Modulo) listar(w http.ResponseWriter, r *http.Request) error {
	l, err := m.leerPlanes(r.Context())
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"planes": l, "paquete_ventas": paqueteVentas, "paquete_precio_centimos": paquetePrecio})
	return nil
}

type Uso struct {
	Plan            Plan       `json:"plan"`
	MesGratis       bool       `json:"mes_gratis"`
	Desde           time.Time  `json:"desde"`
	ProximoCobro    *time.Time `json:"proximo_cobro"`
	VentasUsadas    int        `json:"ventas_usadas"`
	VentasExtra     int        `json:"ventas_extra"`
	VentasLimite    *int       `json:"ventas_limite"`
	VentasQuedan    *int       `json:"ventas_quedan"`
	PuedeMesGratis  bool       `json:"puede_mes_gratis"`
	ProductosUsados int        `json:"productos_publicados"`
}

func inicioMes() time.Time {
	n := time.Now().In(lima)
	return time.Date(n.Year(), n.Month(), 1, 0, 0, 0, 0, lima)
}

var lima = time.FixedZone("Lima", -5*3600)

// LeerUso calcula cuántas ventas del mes ya usó la tienda.
// Cuenta los pedidos aceptados en el mes (los rechazados no gastan cupo).
func LeerUso(ctx context.Context, q core.Ejecutor, tiendaID string) (Uso, error) {
	var u Uso
	var fin sql.NullTime
	err := q.QueryRowContext(ctx, `SELECT p.id, p.nombre, p.precio_centimos, p.ventas_mes, p.creditos_ia, p.productos_max, s.mes_gratis, s.inicio, s.fin,
		(SELECT count(*) FROM productos WHERE tienda_id=s.tienda_id AND activo AND NOT eliminado)
		FROM suscripciones s JOIN planes p ON p.id=s.plan_id WHERE s.tienda_id=$1 AND s.activa`, tiendaID).
		Scan(&u.Plan.ID, &u.Plan.Nombre, &u.Plan.Precio, &u.Plan.VentasMes, &u.Plan.CreditosIA, &u.Plan.ProductosMax, &u.MesGratis, &u.Desde, &fin, &u.ProductosUsados)
	if err != nil {
		return u, err
	}
	if fin.Valid {
		u.ProximoCobro = &fin.Time
	}
	mes := inicioMes()
	q.QueryRowContext(ctx, `SELECT count(*) FROM pedidos WHERE tienda_id=$1 AND aceptado_en >= $2 AND estado <> 'rechazado'`, tiendaID, mes).Scan(&u.VentasUsadas)
	q.QueryRowContext(ctx, `SELECT COALESCE(SUM(cantidad),0) FROM ventas_extra WHERE tienda_id=$1 AND periodo=$2`, tiendaID, mes.Format("2006-01-02")).Scan(&u.VentasExtra)
	if u.Plan.VentasMes != nil {
		lim := *u.Plan.VentasMes + u.VentasExtra
		quedan := max(lim-u.VentasUsadas, 0)
		u.VentasLimite, u.VentasQuedan = &lim, &quedan
	}
	var usoGratis bool
	q.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM suscripciones WHERE tienda_id=$1 AND mes_gratis)`, tiendaID).Scan(&usoGratis)
	u.PuedeMesGratis = !usoGratis
	return u, nil
}

// ValidarCupo se ejecuta al aceptar un pedido.
func (m *Modulo) ValidarCupo(ctx context.Context, tiendaID string) error {
	u, err := LeerUso(ctx, m.app.DB, tiendaID)
	if err != nil {
		return err
	}
	if u.VentasQuedan != nil && *u.VentasQuedan <= 0 {
		return httpx.Conflicto("cupo_agotado", fmt.Sprintf("Usaste tus %d ventas del mes. Compra +%d ventas por S/ 5 o cambia de plan para seguir aceptando pedidos.",
			*u.VentasLimite, paqueteVentas))
	}
	return nil
}

func (m *Modulo) actual(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	u, err := LeerUso(ctx, m.app.DB, tid)
	if err != nil {
		return err
	}
	httpx.OK(w, u)
	return nil
}

// cambiar activa otro plan. El primer plan de pago tiene el primer mes gratis.
// Un plan de pago crea su cobro y se activa solo cuando Culqi lo aprueba (POST /plan/pagos/{id}/culqi).
func (m *Modulo) cambiar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		PlanID string `json:"plan_id"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	var precio int
	var nombre string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT nombre, precio_centimos FROM planes WHERE id=$1 AND disponible`, in.PlanID).Scan(&nombre, &precio); err != nil {
		return httpx.Invalido("Ese plan no está disponible por ahora. Elige otro.")
	}
	var pagoID string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		u, err := LeerUso(ctx, tx, tid)
		if err != nil {
			return err
		}
		if u.Plan.ID == in.PlanID {
			return httpx.Conflicto("mismo_plan", "Ya estás en el plan "+nombre+".")
		}
		// Un plan elegido antes y que no se llegó a pagar se reemplaza por esta elección.
		if _, err := tx.ExecContext(ctx, `DELETE FROM pagos_plan WHERE tienda_id=$1 AND tipo='plan' AND estado='pendiente' AND referencia_tienda=''`, tid); err != nil {
			return err
		}
		gratis := precio > 0 && u.PuedeMesGratis
		usr, _ := httpx.UsuarioDe(ctx)
		if precio > 0 && !gratis {
			// Plan de pago: se cobra con Culqi y se activa solo al aprobarse el cobro.
			if !m.culqiListo() {
				return errSinCulqi
			}
			if err := tx.QueryRowContext(ctx, `INSERT INTO pagos_plan (tienda_id, concepto, monto_centimos, metodo, estado, tipo, plan_id)
				VALUES ($1,$2,$3,'culqi','pendiente','plan',$4) RETURNING id::text`, tid, "Plan "+nombre, precio, in.PlanID).Scan(&pagoID); err != nil {
				return err
			}
			m.app.Auditar(ctx, tx, usr.ID, "pedir_plan", "tienda", tid, map[string]any{"plan": in.PlanID, "monto": precio})
			return nil
		}
		if err := AplicarPlan(ctx, tx, tid, in.PlanID, gratis, 0); err != nil {
			return err
		}
		if gratis {
			if _, err := tx.ExecContext(ctx, `INSERT INTO pagos_plan (tienda_id, concepto, monto_centimos, estado, tipo, plan_id, confirmado_en)
				VALUES ($1,$2,0,'confirmado','plan',$3, now())`, tid, "Plan "+nombre+" · primer mes gratis", in.PlanID); err != nil {
				return err
			}
		}
		m.app.Auditar(ctx, tx, usr.ID, "cambiar_plan", "tienda", tid, map[string]any{"plan": in.PlanID, "monto": 0})
		return nil
	})
	if err != nil {
		return err
	}
	return m.responderUso(w, r, pagoID)
}

// AplicarPlan activa el plan de la tienda (cuando es gratis, es el mes gratis o VendiGo ya confirmó el pago).
func AplicarPlan(ctx context.Context, tx *sql.Tx, tid, planID string, mesGratis bool, monto int) error {
	var fin any
	if planID != "gratis" {
		fin = time.Now().AddDate(0, 1, 0)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE suscripciones SET activa=false, fin=COALESCE(fin, now()) WHERE tienda_id=$1 AND activa`, tid); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO suscripciones (tienda_id, plan_id, mes_gratis, monto_centimos, fin) VALUES ($1,$2,$3,$4,$5)`,
		tid, planID, mesGratis, monto, fin)
	return err
}

// Créditos de IA extra: compra opcional cuando a la tienda se le acaban los del plan.
// Solo se pagan con Culqi (a la cuenta de VendiGo) y se entregan recién cuando el cobro se aprueba.
const (
	PaqueteCreditosIA = 100
	PrecioCreditosIA  = 500 // S/ 5
)

// AplicarCreditosIA suma los créditos del mes cuando Culqi aprobó su pago.
func AplicarCreditosIA(ctx context.Context, tx *sql.Tx, tid string, monto int) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO creditos_extra (tienda_id, cantidad, monto_centimos, periodo) VALUES ($1,$2,$3,$4)`,
		tid, PaqueteCreditosIA, monto, inicioMes().Format("2006-01-02"))
	return err
}

// AplicarVentasExtra suma el paquete de ventas del mes cuando VendiGo confirmó su pago.
func AplicarVentasExtra(ctx context.Context, tx *sql.Tx, tid string, monto int) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO ventas_extra (tienda_id, cantidad, monto_centimos, periodo) VALUES ($1,$2,$3,$4)`,
		tid, paqueteVentas, monto, inicioMes().Format("2006-01-02"))
	return err
}

func (m *Modulo) comprarExtra(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	u, err := LeerUso(ctx, m.app.DB, tid)
	if err != nil {
		return err
	}
	if u.VentasLimite == nil {
		return httpx.Conflicto("ilimitado", "Tu plan tiene ventas ilimitadas.")
	}
	if !m.culqiListo() {
		return errSinCulqi
	}
	var pagoID string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		// Un pedido anterior de ventas extra que no se llegó a pagar se reemplaza por este.
		if _, err := tx.ExecContext(ctx, `DELETE FROM pagos_plan WHERE tienda_id=$1 AND tipo='ventas_extra' AND estado='pendiente' AND referencia_tienda=''`, tid); err != nil {
			return err
		}
		// Se cobra con Culqi y las ventas se suman solo al aprobarse el cobro.
		return tx.QueryRowContext(ctx, `INSERT INTO pagos_plan (tienda_id, concepto, monto_centimos, metodo, estado, tipo)
			VALUES ($1,$2,$3,'culqi','pendiente','ventas_extra') RETURNING id::text`, tid, fmt.Sprintf("+%d ventas", paqueteVentas), paquetePrecio).Scan(&pagoID)
	})
	if err != nil {
		return err
	}
	return m.responderUso(w, r, pagoID)
}

func (m *Modulo) pagos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id, concepto, monto_centimos, metodo, estado, referencia, referencia_tienda, motivo_rechazo, creado_en FROM pagos_plan WHERE tienda_id=$1 ORDER BY creado_en DESC`, tid)
	if err != nil {
		return err
	}
	defer rows.Close()
	type pago struct {
		ID       string    `json:"id"`
		Concepto string    `json:"concepto"`
		Monto    int       `json:"monto_centimos"`
		Metodo   string    `json:"metodo"`
		Estado   string    `json:"estado"`
		Ref      string    `json:"referencia"`
		RefT     string    `json:"referencia_tienda"`
		Motivo   string    `json:"motivo_rechazo"`
		Fecha    time.Time `json:"fecha"`
	}
	out := []pago{}
	for rows.Next() {
		var p pago
		rows.Scan(&p.ID, &p.Concepto, &p.Monto, &p.Metodo, &p.Estado, &p.Ref, &p.RefT, &p.Motivo, &p.Fecha)
		out = append(out, p)
	}
	// Cómo pagarle a VendiGo: solo Culqi. Lo comprado se activa en cuanto Culqi aprueba el cobro.
	httpx.OK(w, map[string]any{"pagos": out, "pago_vendigo": m.cobro(ctx)})
	return nil
}
