package pedidos

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// Sugerencia de la semana: sale solo de los datos de la tienda (no gasta créditos de IA).
type Sugerencia struct {
	Icono   string `json:"icono"`
	Antes   string `json:"antes,omitempty"`
	Texto   string `json:"texto"`
	Negrita string `json:"negrita"`
	Boton   string `json:"boton,omitempty"`
	Enlace  string `json:"enlace,omitempty"`
}

var nombresDia = []string{"domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"}

const vendidos = `p.estado NOT IN ('rechazado','cancelado')`

// inicio devuelve lo extra del panel: comparaciones, rendimiento y sugerencias de la semana.
func (m *Modulo) inicio(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	db := m.app.DB

	var mesAnterior, clientesNuevos int
	db.QueryRowContext(ctx, `SELECT COALESCE(SUM(total_centimos),0) FROM pedidos p WHERE tienda_id=$1 AND `+vendidos+`
		AND (creado_en AT TIME ZONE 'America/Lima') >= date_trunc('month', now() AT TIME ZONE 'America/Lima') - interval '1 month'
		AND (creado_en AT TIME ZONE 'America/Lima') < now() AT TIME ZONE 'America/Lima' - interval '1 month'`, tid).Scan(&mesAnterior)
	db.QueryRowContext(ctx, `SELECT count(*) FROM (SELECT comprador_celular FROM pedidos WHERE tienda_id=$1
		GROUP BY comprador_celular HAVING min(creado_en AT TIME ZONE 'America/Lima') >= date_trunc('month', now() AT TIME ZONE 'America/Lima')) x`, tid).Scan(&clientesNuevos)

	// Rendimiento de los últimos 30 días.
	var visitas, pedidos30 int
	var respuesta sql.NullFloat64
	db.QueryRowContext(ctx, `SELECT COALESCE(SUM(cantidad),0) FROM visitas WHERE tienda_id=$1 AND dia > (now() AT TIME ZONE 'America/Lima')::date - 30`, tid).Scan(&visitas)
	db.QueryRowContext(ctx, `SELECT count(*) FROM pedidos p WHERE tienda_id=$1 AND `+vendidos+` AND creado_en > now() - interval '30 days'`, tid).Scan(&pedidos30)
	db.QueryRowContext(ctx, `SELECT avg(extract(epoch FROM q.respondida_en - q.creado_en)/60) FROM preguntas q JOIN productos p ON p.id=q.producto_id
		WHERE p.tienda_id=$1 AND q.respondida_en > now() - interval '30 days'`, tid).Scan(&respuesta)
	rend := map[string]any{"visitas_30d": visitas, "pedidos_30d": pedidos30, "conversion_pct": nil, "respuesta_min": nil, "valoracion": nil}
	// Solo se muestra si hay datos suficientes (los pedidos no pueden superar a las visitas).
	if visitas >= 20 && visitas >= pedidos30 {
		rend["conversion_pct"] = float64(pedidos30) * 100 / float64(visitas)
	}
	if respuesta.Valid {
		rend["respuesta_min"] = int(respuesta.Float64 + 0.5)
	}

	var plan string
	db.QueryRowContext(ctx, `SELECT plan_id FROM suscripciones WHERE tienda_id=$1 AND activa ORDER BY creado_en DESC LIMIT 1`, tid).Scan(&plan)
	limite := 5
	switch plan {
	case "gratis", "":
		limite = 0
	case "emprende":
		limite = 2
	}
	sug := []Sugerencia{}
	if limite > 0 {
		sug = m.sugerencias(ctx, tid)
		if len(sug) > limite {
			sug = sug[:limite]
		}
	}

	httpx.OK(w, map[string]any{
		"vendido_mes_anterior_centimos": mesAnterior,
		"clientes_nuevos_mes":           clientesNuevos,
		"rendimiento":                   rend,
		"plan":                          plan,
		"sugerencias_disponibles":       limite > 0,
		"sugerencias_completas":         limite >= 5,
		"sugerencias":                   sug,
	})
	return nil
}

func (m *Modulo) sugerencias(ctx context.Context, tid string) []Sugerencia {
	db := m.app.DB
	out := []Sugerencia{}

	// 1. Lo más vendido de la semana.
	var topID, topNombre string
	var topCant int
	db.QueryRowContext(ctx, `SELECT pr.id, pr.nombre, SUM(i.cantidad) FROM pedido_items i
		JOIN pedidos p ON p.id=i.pedido_id JOIN productos pr ON pr.id=i.producto_id
		WHERE p.tienda_id=$1 AND `+vendidos+` AND p.creado_en > now() - interval '7 days' AND NOT pr.eliminado
		GROUP BY pr.id, pr.nombre ORDER BY 3 DESC LIMIT 1`, tid).Scan(&topID, &topNombre, &topCant)
	if topID != "" {
		out = append(out, Sugerencia{Icono: "tendencia", Negrita: topNombre, Texto: "fue lo más vendido esta semana. Comparte su link en tus redes.",
			Boton: "Compartir", Enlace: "/vendedor/tienda/compartir"})
	}

	// 2. Se vende bien y queda poco stock.
	var bajoID, bajoNombre string
	var bajoStock int
	db.QueryRowContext(ctx, `SELECT pr.id, pr.nombre, pr.stock FROM productos pr
		JOIN pedido_items i ON i.producto_id=pr.id JOIN pedidos p ON p.id=i.pedido_id
		WHERE pr.tienda_id=$1 AND NOT pr.eliminado AND pr.activo AND pr.stock BETWEEN 1 AND 3
		AND `+vendidos+` AND p.creado_en > now() - interval '30 days'
		GROUP BY pr.id ORDER BY SUM(i.cantidad) DESC LIMIT 1`, tid).Scan(&bajoID, &bajoNombre, &bajoStock)
	if bajoID != "" {
		out = append(out, Sugerencia{Icono: "alerta", Negrita: bajoNombre,
			Texto: fmt.Sprintf("se vende bien y te quedan %d. Repón stock antes del fin de semana.", bajoStock),
			Boton: "Editar stock", Enlace: "/vendedor/productos/" + bajoID})
	}

	// 3. Muchas visitas y pocas ventas.
	var frioID, frioNombre string
	var frioVisitas int
	db.QueryRowContext(ctx, `SELECT pr.id, pr.nombre, v.total FROM productos pr
		JOIN (SELECT producto_id, SUM(cantidad) total FROM visitas WHERE tienda_id=$1 AND dia > (now() AT TIME ZONE 'America/Lima')::date - 30 GROUP BY producto_id) v ON v.producto_id=pr.id
		LEFT JOIN (SELECT i.producto_id, SUM(i.cantidad) n FROM pedido_items i JOIN pedidos p ON p.id=i.pedido_id
			WHERE p.tienda_id=$1 AND `+vendidos+` AND p.creado_en > now() - interval '30 days' GROUP BY i.producto_id) s ON s.producto_id=pr.id
		WHERE pr.tienda_id=$1 AND NOT pr.eliminado AND pr.activo AND pr.stock > 0 AND v.total >= 20
		AND COALESCE(s.n,0)*100 < v.total*2 AND pr.id::text <> $2
		ORDER BY v.total / GREATEST(COALESCE(s.n,0),1) DESC LIMIT 1`, tid, topID).Scan(&frioID, &frioNombre, &frioVisitas)
	if frioID != "" {
		out = append(out, Sugerencia{Icono: "ojo", Negrita: frioNombre,
			Texto: fmt.Sprintf("tiene %d visitas pero pocas ventas. Revisa sus fotos o su precio.", frioVisitas),
			Boton: "Revisar producto", Enlace: "/vendedor/productos/" + frioID})
	}

	// 4. Preguntas sin responder.
	var preguntas int
	db.QueryRowContext(ctx, `SELECT count(*) FROM preguntas q JOIN productos p ON p.id=q.producto_id WHERE p.tienda_id=$1 AND q.respuesta IS NULL`, tid).Scan(&preguntas)
	if preguntas > 0 {
		neg := fmt.Sprintf("%d preguntas", preguntas)
		if preguntas == 1 {
			neg = "1 pregunta"
		}
		out = append(out, Sugerencia{Icono: "chat", Antes: "Tienes", Negrita: neg, Texto: "de clientes sin responder. Responder rápido ayuda a vender más.",
			Boton: "Responder", Enlace: "/vendedor/consultas"})
	}

	// 5. Días en que más compran (con al menos 5 pedidos en 90 días).
	rows, err := db.QueryContext(ctx, `SELECT extract(dow FROM creado_en AT TIME ZONE 'America/Lima')::int d, count(*) FROM pedidos p
		WHERE tienda_id=$1 AND `+vendidos+` AND creado_en > now() - interval '90 days' GROUP BY d ORDER BY 2 DESC`, tid)
	if err == nil {
		dias, total := []int{}, 0
		for rows.Next() {
			var d, n int
			rows.Scan(&d, &n)
			dias = append(dias, d)
			total += n
		}
		rows.Close()
		if total >= 5 && len(dias) >= 2 {
			a, b := dias[0], dias[1]
			if (b-a+7)%7 > 3 { // que queden en orden de la semana (viernes y sábados)
				a, b = b, a
			}
			antes := (a + 6) % 7
			out = append(out, Sugerencia{Icono: "calendario", Antes: "Tus clientes compran más los", Negrita: nombresDia[a] + " y " + nombresDia[b],
				Texto: ". Comparte tus productos el " + singular(antes) + "."})
		}
	}
	return out
}

func singular(d int) string {
	return []string{"domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"}[d]
}
