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
// En esta versión el cobro de la suscripción se simula; en producción se hace con Culqi (cargo recurrente).
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
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		u, err := LeerUso(ctx, tx, tid)
		if err != nil {
			return err
		}
		if u.Plan.ID == in.PlanID {
			return httpx.Conflicto("mismo_plan", "Ya estás en el plan "+nombre+".")
		}
		gratis := precio > 0 && u.PuedeMesGratis
		monto := precio
		if gratis || precio == 0 {
			monto = 0
		}
		var fin any
		if precio > 0 {
			fin = time.Now().AddDate(0, 1, 0)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE suscripciones SET activa=false, fin=COALESCE(fin, now()) WHERE tienda_id=$1 AND activa`, tid); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO suscripciones (tienda_id, plan_id, mes_gratis, monto_centimos, fin) VALUES ($1,$2,$3,$4,$5)`,
			tid, in.PlanID, gratis, monto, fin); err != nil {
			return err
		}
		if precio > 0 {
			concepto := "Plan " + nombre
			if gratis {
				concepto += " · primer mes gratis"
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO pagos_plan (tienda_id, concepto, monto_centimos) VALUES ($1,$2,$3)`, tid, concepto, monto); err != nil {
				return err
			}
		}
		usr, _ := httpx.UsuarioDe(ctx)
		m.app.Auditar(ctx, tx, usr.ID, "cambiar_plan", "tienda", tid, map[string]any{"plan": in.PlanID, "monto": monto})
		return nil
	})
	if err != nil {
		return err
	}
	return m.actual(w, r)
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
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO ventas_extra (tienda_id, cantidad, monto_centimos, periodo) VALUES ($1,$2,$3,$4)`,
			tid, paqueteVentas, paquetePrecio, inicioMes().Format("2006-01-02")); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO pagos_plan (tienda_id, concepto, monto_centimos) VALUES ($1,$2,$3)`,
			tid, fmt.Sprintf("+%d ventas", paqueteVentas), paquetePrecio)
		return err
	})
	if err != nil {
		return err
	}
	return m.actual(w, r)
}

func (m *Modulo) pagos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id, concepto, monto_centimos, metodo, creado_en FROM pagos_plan WHERE tienda_id=$1 ORDER BY creado_en DESC`, tid)
	if err != nil {
		return err
	}
	defer rows.Close()
	type pago struct {
		ID       string    `json:"id"`
		Concepto string    `json:"concepto"`
		Monto    int       `json:"monto_centimos"`
		Metodo   string    `json:"metodo"`
		Fecha    time.Time `json:"fecha"`
	}
	out := []pago{}
	for rows.Next() {
		var p pago
		rows.Scan(&p.ID, &p.Concepto, &p.Monto, &p.Metodo, &p.Fecha)
		out = append(out, p)
	}
	httpx.OK(w, map[string]any{"pagos": out})
	return nil
}
