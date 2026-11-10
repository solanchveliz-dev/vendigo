// Package live: Modo live. La vendedora transmite en sus redes y comparte el enlace de su tienda; separar un
// producto crea un pedido normal con un plazo de pago de minutos. No hay tabla de reservas aparte: la separación
// ES el pedido, y el vencimiento lo hace la misma tarea que cancela los pedidos sin pago (pedidos.VencerPedidosSinPago).
package live

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// Minutos que la vendedora puede elegir (botones, no un número libre: así no hay plazos inválidos).
var Minutos = []int{3, 5, 10, 15}

// MaxSeparadosPorCelular: separaciones sin pagar que una misma persona puede tener a la vez en una tienda.
const MaxSeparadosPorCelular = 3

type Modulo struct{ app *core.App }

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

func (m *Modulo) RutasVendedor(r chi.Router) {
	r.Method("GET", "/live", httpx.Handler(m.panel))
	r.Method("PUT", "/live", httpx.Handler(m.guardar))
}

func (m *Modulo) RutasPublicas(r chi.Router) {
	r.Method("GET", "/tiendas/{slug}/live", httpx.Handler(m.publico))
}

type Producto struct {
	ID        string `json:"id"`
	Codigo    *int   `json:"codigo"`
	Nombre    string `json:"nombre"`
	Precio    int    `json:"precio_centimos"`
	Stock     int    `json:"stock"`
	Variantes bool   `json:"tiene_variantes"`
	ImagenURL string `json:"imagen_url"`
}

func (m *Modulo) productos(ctx context.Context, tid string, soloLive bool) ([]Producto, error) {
	filtro := ""
	if soloLive {
		filtro = " AND p.live_codigo IS NOT NULL AND p.activo"
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.live_codigo, p.nombre, p.precio_centimos, p.stock,
		EXISTS (SELECT 1 FROM producto_variantes v WHERE v.producto_id=p.id),
		(SELECT key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY orden LIMIT 1)
		FROM productos p WHERE p.tienda_id=$1 AND NOT p.eliminado`+filtro+`
		ORDER BY p.live_codigo NULLS LAST, p.nombre LIMIT 300`, tid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Producto{}
	for rows.Next() {
		var p Producto
		var img sql.NullString
		if err := rows.Scan(&p.ID, &p.Codigo, &p.Nombre, &p.Precio, &p.Stock, &p.Variantes, &img); err != nil {
			return nil, err
		}
		if img.Valid {
			p.ImagenURL = m.app.Archivos.URLPublica(img.String)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ---------- vendedora ----------

type Separado struct {
	PedidoID  string    `json:"pedido_id"`
	Codigo    string    `json:"codigo"`
	Comprador string    `json:"comprador"`
	Producto  string    `json:"producto"`
	Total     int       `json:"total_centimos"`
	Grupo     string    `json:"grupo"` // separado · por_revisar · confirmado · vencido · cancelado
	Segundos  int       `json:"segundos_para_pagar"`
	CreadoEn  time.Time `json:"creado_en"`
}

func (m *Modulo) panel(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var activo bool
	var minutos int
	var desde *time.Time
	var slug string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT live_activo, live_minutos, live_desde, slug FROM tiendas WHERE id=$1`, tid).
		Scan(&activo, &minutos, &desde, &slug); err != nil {
		return err
	}
	prods, err := m.productos(ctx, tid, false)
	if err != nil {
		return err
	}
	// Tablero: los pedidos del live actual (o de las últimas 12 h si ya terminó).
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, p.comprador_nombre,
		COALESCE((SELECT nombre FROM pedido_items i WHERE i.pedido_id=p.id ORDER BY nombre LIMIT 1), ''),
		p.total_centimos, p.estado, p.vencido_sin_pago, g.estado,
		GREATEST(0, EXTRACT(EPOCH FROM (p.pago_vence_en - now())))::int, p.creado_en
		FROM pedidos p JOIN pagos g ON g.pedido_id=p.id
		WHERE p.tienda_id=$1 AND p.del_live AND p.creado_en >= COALESCE($2, now() - interval '12 hours')
		ORDER BY p.creado_en DESC LIMIT 300`, tid, desde)
	if err != nil {
		return err
	}
	defer rows.Close()
	tablero := []Separado{}
	for rows.Next() {
		var s Separado
		var estado, pago string
		var vencido bool
		var segundos sql.NullInt64
		if err := rows.Scan(&s.PedidoID, &s.Codigo, &s.Comprador, &s.Producto, &s.Total, &estado, &vencido, &pago, &segundos, &s.CreadoEn); err != nil {
			return err
		}
		s.Grupo = grupo(estado, pago, vencido)
		if s.Grupo == "separado" {
			s.Segundos = int(segundos.Int64)
		}
		tablero = append(tablero, s)
	}
	httpx.OK(w, map[string]any{
		"activo": activo, "minutos": minutos, "opciones_minutos": Minutos, "desde": desde,
		"enlace": m.app.Cfg.WebURL + "/t/" + slug + "/live", "productos": prods, "tablero": tablero,
	})
	return rows.Err()
}

// grupo ubica un pedido del live en el tablero. Separado ≠ pagado ≠ confirmado.
func grupo(estado, pago string, vencido bool) string {
	switch {
	case vencido:
		return "vencido"
	case estado == "cancelado" || estado == "rechazado":
		return "cancelado"
	case pago == "pendiente":
		return "separado"
	case pago == "comprobante_enviado" || pago == "no_recibido":
		return "por_revisar"
	}
	return "confirmado"
}

func (m *Modulo) guardar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Activo    bool     `json:"activo"`
		Minutos   int      `json:"minutos"`
		Productos []string `json:"productos"` // en el orden en que se mostrarán; reciben los códigos 1, 2, 3…
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	valido := false
	for _, x := range Minutos {
		valido = valido || x == in.Minutos
	}
	if !valido {
		return httpx.Invalido("Elige 3, 5, 10 o 15 minutos para pagar.")
	}
	if len(in.Productos) > 999 {
		return httpx.Invalido("Son demasiados productos para un live.")
	}
	if in.Activo && len(in.Productos) == 0 {
		return httpx.Invalido("Elige al menos un producto para tu live.")
	}
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		// Al prender el live empieza un tablero nuevo; si ya estaba prendido, se conserva.
		if _, err := tx.ExecContext(ctx, `UPDATE tiendas SET live_activo=$2, live_minutos=$3,
			live_desde = CASE WHEN $2 AND NOT live_activo THEN now() ELSE live_desde END WHERE id=$1`, tid, in.Activo, in.Minutos); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE productos SET live_codigo=NULL WHERE tienda_id=$1 AND live_codigo IS NOT NULL`, tid); err != nil {
			return err
		}
		if len(in.Productos) == 0 {
			return nil
		}
		res, err := tx.ExecContext(ctx, `UPDATE productos p SET live_codigo=x.n
			FROM unnest($2::uuid[]) WITH ORDINALITY AS x(id, n)
			WHERE p.id=x.id AND p.tienda_id=$1 AND NOT p.eliminado`, tid, pq.Array(in.Productos))
		if err != nil {
			return httpx.Invalido("Uno de los productos no es válido.")
		}
		if n, _ := res.RowsAffected(); int(n) != len(in.Productos) {
			return httpx.Invalido("Uno de los productos no es de tu tienda.")
		}
		return nil
	})
	if err != nil {
		return err
	}
	return m.panel(w, r)
}

// ---------- compradora ----------

func (m *Modulo) publico(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var tid, nombre string
	var activo bool
	var minutos int
	err := m.app.DB.QueryRowContext(ctx, `SELECT id, nombre, live_activo, live_minutos FROM tiendas
		WHERE slug=$1 AND activa AND tienda_identidad_verificada(id)`, chi.URLParam(r, "slug")).Scan(&tid, &nombre, &activo, &minutos)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	prods := []Producto{}
	if activo {
		if prods, err = m.productos(ctx, tid, true); err != nil {
			return err
		}
	}
	httpx.OK(w, map[string]any{"tienda": nombre, "activo": activo, "minutos": minutos, "productos": prods})
	return nil
}

// Validar revisa una compra hecha desde el live y devuelve el plazo para pagar. La usa la compra sin cuenta.
// Reglas: el live está prendido, todos los productos están en el live y la persona no acapara separaciones.
func Validar(ctx context.Context, tx *sql.Tx, tid, celular string, productos []string) (time.Duration, error) {
	var activo bool
	var minutos int
	if err := tx.QueryRowContext(ctx, `SELECT live_activo, live_minutos FROM tiendas WHERE id=$1`, tid).Scan(&activo, &minutos); err != nil {
		return 0, err
	}
	if !activo {
		return 0, httpx.Conflicto("live_cerrado", "El live de esta tienda ya terminó. Puedes comprar normalmente desde la tienda.")
	}
	var fuera int
	if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM unnest($2::uuid[]) AS x(id)
		WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.id=x.id AND p.tienda_id=$1 AND p.live_codigo IS NOT NULL)`,
		tid, pq.Array(productos)).Scan(&fuera); err != nil {
		return 0, httpx.Invalido("Uno de los productos no es válido.")
	}
	if fuera > 0 {
		return 0, httpx.Conflicto("fuera_del_live", "Uno de los productos ya no está en el live. Revisa tu pedido.")
	}
	var abiertas int
	tx.QueryRowContext(ctx, `SELECT count(*) FROM pedidos p JOIN pagos g ON g.pedido_id=p.id
		WHERE p.tienda_id=$1 AND p.comprador_celular=$2 AND p.del_live AND g.estado='pendiente'
		AND p.estado NOT IN ('cancelado','rechazado') AND p.pago_vence_en > now()`, tid, celular).Scan(&abiertas)
	if abiertas >= MaxSeparadosPorCelular {
		return 0, httpx.Conflicto("muchos_separados", "Ya tienes separaciones sin pagar en esta tienda. Paga una antes de separar otra.")
	}
	return time.Duration(minutos) * time.Minute, nil
}
