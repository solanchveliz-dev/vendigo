package pedidos

import (
	"context"
	"math"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// Analítica de la tienda: todos los números salen de los pedidos reales.
// El pronóstico es un cálculo matemático (tendencia de las últimas 8 semanas), no IA.

const vendido = `estado NOT IN ('rechazado','cancelado')`

type Barra struct {
	Etiqueta string `json:"etiqueta"`
	Valor    int    `json:"valor"`
}

type Pronostico struct {
	ProductoID   string   `json:"producto_id"`
	Nombre       string   `json:"nombre"`
	ImagenURL    string   `json:"imagen_url"`
	Stock        int      `json:"stock"`
	Precio       int      `json:"precio_centimos"`
	Vendidos     int      `json:"vendidos"`          // en el periodo elegido
	Anterior     int      `json:"vendidos_anterior"` // en el periodo anterior de igual largo
	CambioPct    *int     `json:"cambio_pct"`
	Semanas      []int    `json:"semanas"`         // unidades por semana, de la más antigua a la actual (8)
	Proximas4    int      `json:"pronostico_4sem"` // unidades estimadas para las próximas 4 semanas
	DiasAgotar   *int     `json:"dias_para_agotar"`
	Tendencia    string   `json:"tendencia"` // sube, baja, estable, pocas, sin_datos
	Visitas      int      `json:"visitas"`
	Conversion   *float64 `json:"conversion_pct"`
	SinMovimient bool     `json:"sin_movimiento"`
}

type Analitica struct {
	Dias int `json:"dias"`
	// Lo que incluye el plan: Gratis = básico; Emprende = + productos, pronóstico y analista IA;
	// Crece y Pro = + ver 3 meses.
	Plan           string       `json:"plan"`
	Completa       bool         `json:"completa"`
	TresMeses      bool         `json:"tres_meses"`
	Ventas         int          `json:"ventas_centimos"`
	VentasAnterior int          `json:"ventas_anterior_centimos"`
	Neto           int          `json:"neto_centimos"`
	Pedidos        int          `json:"pedidos"`
	PedidosAnt     int          `json:"pedidos_anterior"`
	Unidades       int          `json:"unidades"`
	Clientes       int          `json:"clientes"`
	Nuevos         int          `json:"clientes_nuevos"`
	Recurrentes    int          `json:"clientes_recurrentes"`
	Serie          []Barra      `json:"serie"` // por día (7 días) o por semana
	Entregas       []Barra      `json:"entregas"`
	DiasSemana     []Barra      `json:"dias_semana"` // pedidos por día de la semana (90 días)
	Productos      []Pronostico `json:"productos"`
}

const lima = "America/Lima"

// Analizar calcula la analítica y el pronóstico de una tienda. La usa la pantalla y el analista con IA.
func Analizar(ctx context.Context, db core.Ejecutor, tid string, dias int) (*Analitica, error) {
	if dias != 7 && dias != 90 {
		dias = 30
	}
	a := &Analitica{Dias: dias}
	desde := `now() - make_interval(days => $2)`
	antes := `now() - make_interval(days => $2 * 2)`

	if err := db.QueryRowContext(ctx, `SELECT
		COALESCE(SUM(total_centimos) FILTER (WHERE creado_en > `+desde+`),0),
		COALESCE(SUM(total_centimos - comision_pasarela_centimos) FILTER (WHERE creado_en > `+desde+`),0),
		count(*) FILTER (WHERE creado_en > `+desde+`),
		COALESCE(SUM(total_centimos) FILTER (WHERE creado_en <= `+desde+`),0),
		count(*) FILTER (WHERE creado_en <= `+desde+`),
		count(DISTINCT comprador_celular) FILTER (WHERE creado_en > `+desde+`)
		FROM pedidos WHERE tienda_id=$1 AND `+vendido+` AND creado_en > `+antes, tid, dias).
		Scan(&a.Ventas, &a.Neto, &a.Pedidos, &a.VentasAnterior, &a.PedidosAnt, &a.Clientes); err != nil {
		return nil, err
	}
	db.QueryRowContext(ctx, `SELECT COALESCE(SUM(i.cantidad),0) FROM pedido_items i JOIN pedidos p ON p.id=i.pedido_id
		WHERE p.tienda_id=$1 AND p.`+vendido+` AND p.creado_en > `+desde, tid, dias).Scan(&a.Unidades)
	db.QueryRowContext(ctx, `SELECT count(*) FILTER (WHERE primera > now() - make_interval(days => $2)), count(*) FILTER (WHERE primera <= now() - make_interval(days => $2))
		FROM (SELECT comprador_celular, min(creado_en) primera, max(creado_en) ultima FROM pedidos WHERE tienda_id=$1 AND `+vendido+` GROUP BY 1) c
		WHERE ultima > now() - make_interval(days => $2)`, tid, dias).Scan(&a.Nuevos, &a.Recurrentes)

	// Serie: por día si son 7 días; por semana (de lunes) si son 30 o 90.
	a.Serie = []Barra{}
	if dias == 7 {
		rows, err := db.QueryContext(ctx, `SELECT d::date, COALESCE(SUM(p.total_centimos),0) FROM generate_series((now() AT TIME ZONE '`+lima+`')::date - 6, (now() AT TIME ZONE '`+lima+`')::date, interval '1 day') d
			LEFT JOIN pedidos p ON p.tienda_id=$1 AND p.`+vendido+` AND (p.creado_en AT TIME ZONE '`+lima+`')::date = d::date GROUP BY d ORDER BY d`, tid)
		if err != nil {
			return nil, err
		}
		dn := []string{"Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"}
		for rows.Next() {
			var d time.Time
			var v int
			rows.Scan(&d, &v)
			a.Serie = append(a.Serie, Barra{Etiqueta: dn[d.Weekday()], Valor: v})
		}
		rows.Close()
	} else {
		semanas := dias / 7
		rows, err := db.QueryContext(ctx, `SELECT s, COALESCE(SUM(p.total_centimos),0) FROM generate_series(0, $2 - 1) s
			LEFT JOIN pedidos p ON p.tienda_id=$1 AND p.`+vendido+` AND p.creado_en > now() - make_interval(days => ($2 - s) * 7) AND p.creado_en <= now() - make_interval(days => ($2 - s - 1) * 7)
			GROUP BY s ORDER BY s`, tid, semanas)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var s, v int
			rows.Scan(&s, &v)
			a.Serie = append(a.Serie, Barra{Etiqueta: "Sem " + strconv.Itoa(s+1), Valor: v})
		}
		rows.Close()
	}

	a.Entregas = []Barra{}
	rows, err := db.QueryContext(ctx, `SELECT entrega, count(*) FROM pedidos WHERE tienda_id=$1 AND `+vendido+` AND creado_en > `+desde+` GROUP BY 1 ORDER BY 2 DESC`, tid, dias)
	if err != nil {
		return nil, err
	}
	nombres := map[string]string{"agencia": "Agencia", "motorizado": "Motorizado", "recojo": "Recojo"}
	for rows.Next() {
		var e string
		var n int
		rows.Scan(&e, &n)
		a.Entregas = append(a.Entregas, Barra{Etiqueta: nombres[e], Valor: n})
	}
	rows.Close()

	a.DiasSemana = make([]Barra, 7)
	orden := []string{"Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"}
	for i, d := range orden {
		a.DiasSemana[i] = Barra{Etiqueta: d}
	}
	rows, err = db.QueryContext(ctx, `SELECT extract(isodow FROM creado_en AT TIME ZONE '`+lima+`')::int, count(*) FROM pedidos
		WHERE tienda_id=$1 AND `+vendido+` AND creado_en > now() - interval '90 days' GROUP BY 1`, tid)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var d, n int
		rows.Scan(&d, &n)
		if d >= 1 && d <= 7 {
			a.DiasSemana[d-1].Valor = n
		}
	}
	rows.Close()

	// Productos: ventas del periodo, del anterior y por semana (8 semanas) para el pronóstico.
	rows, err = db.QueryContext(ctx, `SELECT pr.id, pr.nombre, pr.stock, pr.precio_centimos,
		(SELECT key FROM producto_imagenes im WHERE im.producto_id=pr.id ORDER BY orden LIMIT 1),
		COALESCE(SUM(i.cantidad) FILTER (WHERE p.creado_en > `+desde+`),0),
		COALESCE(SUM(i.cantidad) FILTER (WHERE p.creado_en <= `+desde+` AND p.creado_en > `+antes+`),0),
		COALESCE((SELECT SUM(cantidad) FROM visitas v WHERE v.producto_id=pr.id AND v.dia > (now() AT TIME ZONE '`+lima+`')::date - $2),0)
		FROM productos pr
		LEFT JOIN pedido_items i ON i.producto_id=pr.id
		LEFT JOIN pedidos p ON p.id=i.pedido_id AND p.`+vendido+`
		WHERE pr.tienda_id=$1 AND NOT pr.eliminado AND pr.activo
		GROUP BY pr.id`, tid, dias)
	if err != nil {
		return nil, err
	}
	idx := map[string]int{}
	a.Productos = []Pronostico{}
	for rows.Next() {
		var x Pronostico
		var img *string
		rows.Scan(&x.ProductoID, &x.Nombre, &x.Stock, &x.Precio, &img, &x.Vendidos, &x.Anterior, &x.Visitas)
		if img != nil {
			x.ImagenURL = *img // la firma el llamador (necesita el almacenamiento)
		}
		x.Semanas = make([]int, 8)
		idx[x.ProductoID] = len(a.Productos)
		a.Productos = append(a.Productos, x)
	}
	rows.Close()

	rows, err = db.QueryContext(ctx, `SELECT i.producto_id, floor(extract(epoch FROM now() - p.creado_en) / 604800)::int, SUM(i.cantidad)
		FROM pedido_items i JOIN pedidos p ON p.id=i.pedido_id
		WHERE p.tienda_id=$1 AND p.`+vendido+` AND p.creado_en > now() - interval '56 days' AND i.producto_id IS NOT NULL GROUP BY 1, 2`, tid)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var pid string
		var hace, n int
		rows.Scan(&pid, &hace, &n)
		if i, ok := idx[pid]; ok && hace >= 0 && hace < 8 {
			a.Productos[i].Semanas[7-hace] += n
		}
	}
	rows.Close()

	for i := range a.Productos {
		pronosticar(&a.Productos[i])
	}
	sort.SliceStable(a.Productos, func(i, j int) bool {
		if a.Productos[i].Vendidos != a.Productos[j].Vendidos {
			return a.Productos[i].Vendidos > a.Productos[j].Vendidos
		}
		return a.Productos[i].Proximas4 > a.Productos[j].Proximas4
	})
	return a, nil
}

// pronosticar estima las próximas 4 semanas con una recta de tendencia (mínimos cuadrados)
// sobre las últimas 8 semanas, mezclada con el promedio para que no exagere con pocos datos.
func pronosticar(x *Pronostico) {
	if x.Anterior > 0 {
		c := int(math.Round(float64(x.Vendidos-x.Anterior) * 100 / float64(x.Anterior)))
		x.CambioPct = &c
	}
	if x.Visitas > 0 && x.Visitas >= x.Vendidos {
		c := math.Round(float64(x.Vendidos)*1000/float64(x.Visitas)) / 10
		x.Conversion = &c
	}
	total := 0
	for _, v := range x.Semanas {
		total += v
	}
	if total == 0 {
		x.Tendencia = "sin_datos"
		x.SinMovimient = x.Stock > 0
		return
	}
	n := float64(len(x.Semanas))
	var sx, sy, sxy, sxx float64
	for i, v := range x.Semanas {
		fi, fv := float64(i), float64(v)
		sx, sy, sxy, sxx = sx+fi, sy+fv, sxy+fi*fv, sxx+fi*fi
	}
	pendiente := (n*sxy - sx*sy) / (n*sxx - sx*sx)
	base := (sy - pendiente*sx) / n
	promedio := sy / n
	peso := math.Min(1, float64(total)/12) // con pocas ventas, pesa más el promedio
	prox := 0.0
	for k := 8; k < 12; k++ {
		recta := math.Max(0, base+pendiente*float64(k))
		prox += peso*recta + (1-peso)*promedio
	}
	x.Proximas4 = int(math.Round(prox))
	switch rel := pendiente / math.Max(promedio, 0.5); {
	case total < 4: // con menos de 4 ventas en 8 semanas no hay tendencia clara
		x.Tendencia = "pocas"
	case rel > 0.08:
		x.Tendencia = "sube"
	case rel < -0.08:
		x.Tendencia = "baja"
	default:
		x.Tendencia = "estable"
	}
	if diario := prox / 28; x.Proximas4 > 0 && x.Stock > 0 {
		if d := int(math.Ceil(float64(x.Stock) / diario)); d <= 180 { // más de 6 meses no es un dato útil
			x.DiasAgotar = &d
		}
	} else if x.Stock == 0 {
		d := 0
		x.DiasAgotar = &d
	}
}

// NivelPlan devuelve el plan activo y su orden (1 Gratis, 2 Emprende, 3 Crece, 4 Pro).
func NivelPlan(ctx context.Context, db core.Ejecutor, tid string) (string, int) {
	plan, orden := "gratis", 1
	db.QueryRowContext(ctx, `SELECT p.id, p.orden FROM suscripciones s JOIN planes p ON p.id=s.plan_id
		WHERE s.tienda_id=$1 AND s.activa ORDER BY s.creado_en DESC LIMIT 1`, tid).Scan(&plan, &orden)
	return plan, orden
}

var ErrPlanAnalitica = httpx.Conflicto("plan_requerido", "El pronóstico y el analista de ventas están disponibles desde el plan Emprende.")

func (m *Modulo) analitica(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	plan, nivel := NivelPlan(ctx, m.app.DB, tid)
	dias, _ := strconv.Atoi(r.URL.Query().Get("dias"))
	if dias == 90 && nivel < 3 {
		return httpx.Conflicto("plan_requerido", "Ver 3 meses está disponible en los planes Crece y Pro.")
	}
	a, err := Analizar(ctx, m.app.DB, tid, dias)
	if err != nil {
		return err
	}
	a.Plan, a.Completa, a.TresMeses = plan, nivel >= 2, nivel >= 3
	if !a.Completa {
		// Plan Gratis: solo estadísticas básicas.
		a.Productos = []Pronostico{}
		a.Nuevos, a.Recurrentes = 0, 0
	}
	for i := range a.Productos {
		if a.Productos[i].ImagenURL != "" {
			a.Productos[i].ImagenURL = m.app.Archivos.URLPublica(a.Productos[i].ImagenURL)
		}
	}
	httpx.OK(w, a)
	return nil
}
