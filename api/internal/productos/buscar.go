package productos

import (
	"context"
	"database/sql"
	"net/http"
	"strings"

	"github.com/lib/pq"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Búsqueda en VendiGo (como Marketplace): tiendas con productos que coinciden y, arriba,
// los productos impulsados que tienen que ver con lo que se buscó.

// sinTildes normaliza en SQL para buscar sin importar tildes ni mayúsculas.
func sinTildes(col string) string {
	return `lower(translate(` + col + `, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'))`
}

func normalizarBusqueda(q string) string {
	return strings.NewReplacer("ñ", "n").Replace(normalizar(q))
}

// palabras separa la búsqueda en términos (máx. 5) para que "aretes plata" encuentre "Aretes de plata 950".
func palabras(q string) []string {
	out := []string{}
	for _, w := range strings.Fields(normalizarBusqueda(q)) {
		if len([]rune(w)) >= 2 && len(out) < 5 {
			out = append(out, "%"+w+"%")
		}
	}
	return out
}

// coincide arma la condición: cada palabra debe aparecer en el producto o en la tienda.
const textoProducto = `coalesce(p.nombre,'') || ' ' || coalesce(p.descripcion,'') || ' ' || coalesce(p.categoria,'') || ' ' || coalesce(t.nombre,'') || ' ' || coalesce(t.rubro,'')`

func coincide() string {
	return `NOT EXISTS (SELECT 1 FROM unnest($1::text[]) w WHERE ` + sinTildes(textoProducto) + ` NOT LIKE w)`
}

type Impulsado struct {
	ID     string `json:"id"`
	Nombre string `json:"nombre"`
	Precio int    `json:"precio_centimos"`
	Final  int    `json:"precio_final_centimos"`
	Slug   string `json:"tienda_slug"`
	Tienda string `json:"tienda"`
	Imagen string `json:"imagen_url"`
}

// impulsados devuelve productos con impulso vigente que coinciden con la búsqueda (todos si q está vacío)
// y les suma una impresión: es lo que la tienda ve en sus estadísticas del impulso.
func (m *Modulo) impulsados(ctx context.Context, q string, limite int) ([]Impulsado, error) {
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.nombre, p.precio_centimos, t.slug, t.nombre,
		(SELECT key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY orden LIMIT 1),
		(SELECT o.descuento_pct FROM ofertas o WHERE o.producto_id=p.id AND o.termina_en > now())
		FROM productos p JOIN tiendas t ON t.id=p.tienda_id
		WHERE p.destacado_hasta > now() AND p.activo AND NOT p.eliminado AND p.stock > 0
		AND t.activa AND NOT t.pausada AND NOT t.suspendida_garantia
		AND tienda_identidad_verificada(t.id) AND tienda_reclamo_bloqueante(t.id) IS NULL AND `+coincide()+`
		ORDER BY random() LIMIT $2`, pq.Array(palabras(q)), limite)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	lista := []Impulsado{}
	ids := []string{}
	for rows.Next() {
		var it Impulsado
		var key sql.NullString
		var pct sql.NullInt64
		if err := rows.Scan(&it.ID, &it.Nombre, &it.Precio, &it.Slug, &it.Tienda, &key, &pct); err != nil {
			return nil, err
		}
		it.Final = it.Precio
		if pct.Valid {
			it.Final = PrecioConOferta(it.Precio, int(pct.Int64))
		}
		if key.Valid {
			it.Imagen = m.app.Archivos.URLPublica(key.String)
		}
		lista = append(lista, it)
		ids = append(ids, it.ID)
	}
	if len(ids) > 0 {
		m.app.DB.ExecContext(ctx, `UPDATE impulsos SET impresiones = impresiones + 1 WHERE producto_id::text = ANY($1) AND now() BETWEEN inicio AND fin`, pq.Array(ids))
	}
	return lista, rows.Err()
}

// GET /buscar?q=&rubro=&ciudad=&entrega=&orden=
func (m *Modulo) buscar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	qs := r.URL.Query()
	q := strings.TrimSpace(qs.Get("q"))
	if len([]rune(q)) > 80 {
		q = string([]rune(q)[:80])
	}
	rubro, ciudad, entrega, orden := qs.Get("rubro"), strings.TrimSpace(qs.Get("ciudad")), qs.Get("entrega"), qs.Get("orden")
	ws := palabras(q)

	type prod struct {
		ID        string `json:"id"`
		Nombre    string `json:"nombre"`
		Final     int    `json:"precio_final_centimos"`
		Descuento int    `json:"descuento_pct"`
		Imagen    string `json:"imagen_url"`
		Destacado bool   `json:"destacado"`
	}
	type tienda struct {
		ID          string   `json:"id"`
		Nombre      string   `json:"nombre"`
		Slug        string   `json:"slug"`
		Rubro       string   `json:"rubro"`
		Descripcion string   `json:"descripcion"`
		Lugar       string   `json:"lugar"`
		Logo        string   `json:"logo_url"`
		Reputacion  string   `json:"reputacion"`
		Ventas      int      `json:"ventas"`
		Entregas    []string `json:"entregas"`
		Productos   []prod   `json:"productos"`
		Coinciden   int      `json:"coinciden"`
	}
	ord := `coinciden DESC, ventas DESC`
	switch orden {
	case "ventas":
		ord = `ventas DESC`
	case "nuevas":
		ord = `t.creado_en DESC`
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT t.id, t.nombre, t.slug, t.rubro, t.descripcion, coalesce(nullif(t.distrito,''), t.ciudad), t.logo_key, t.reputacion,
		(SELECT count(*) FROM pedidos pe WHERE pe.tienda_id=t.id AND pe.estado='entregado') AS ventas,
		t.entrega_recojo, t.entrega_agencia, t.entrega_motorizado,
		(SELECT count(*) FROM productos p WHERE p.tienda_id=t.id AND p.activo AND NOT p.eliminado AND `+coincide()+`) AS coinciden
		FROM tiendas t
		WHERE t.activa AND NOT t.pausada AND NOT t.suspendida_garantia
		AND tienda_identidad_verificada(t.id) AND tienda_reclamo_bloqueante(t.id) IS NULL
		AND ($2 = '' OR t.rubro = $2)
		AND ($3 = '' OR `+sinTildes("t.ciudad")+` = `+sinTildes("$3")+` OR `+sinTildes("t.distrito")+` = `+sinTildes("$3")+`)
		AND ($4 = '' OR ($4 = 'recojo' AND t.entrega_recojo) OR ($4 = 'agencia' AND t.entrega_agencia) OR ($4 = 'motorizado' AND t.entrega_motorizado))
		AND EXISTS (SELECT 1 FROM productos p WHERE p.tienda_id=t.id AND p.activo AND NOT p.eliminado AND `+coincide()+`)
		ORDER BY `+ord+` LIMIT 30`, pq.Array(ws), rubro, ciudad, entrega)
	if err != nil {
		return err
	}
	tiendas := []tienda{}
	for rows.Next() {
		var t tienda
		var logo sql.NullString
		var rec, age, moto bool
		if err := rows.Scan(&t.ID, &t.Nombre, &t.Slug, &t.Rubro, &t.Descripcion, &t.Lugar, &logo, &t.Reputacion, &t.Ventas, &rec, &age, &moto, &t.Coinciden); err != nil {
			rows.Close()
			return err
		}
		if logo.Valid {
			t.Logo = m.app.Archivos.URLPublica(logo.String)
		}
		t.Entregas = []string{}
		for k, v := range map[string]bool{"recojo": rec, "agencia": age, "motorizado": moto} {
			if v {
				t.Entregas = append(t.Entregas, k)
			}
		}
		tiendas = append(tiendas, t)
	}
	rows.Close()
	// Hasta 3 productos por tienda: primero los impulsados y los que coinciden.
	for i := range tiendas {
		pr, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.nombre, p.precio_centimos,
			(SELECT key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY orden LIMIT 1),
			(SELECT o.descuento_pct FROM ofertas o WHERE o.producto_id=p.id AND o.termina_en > now()),
			coalesce(p.destacado_hasta > now(), false)
			FROM productos p JOIN tiendas t ON t.id=p.tienda_id
			WHERE p.tienda_id=$2 AND p.activo AND NOT p.eliminado AND `+coincide()+`
			ORDER BY coalesce(p.destacado_hasta > now(), false) DESC, p.creado_en DESC LIMIT 3`, pq.Array(ws), tiendas[i].ID)
		if err != nil {
			return err
		}
		tiendas[i].Productos = []prod{}
		for pr.Next() {
			var x prod
			var precio int
			var key sql.NullString
			var pct sql.NullInt64
			if err := pr.Scan(&x.ID, &x.Nombre, &precio, &key, &pct, &x.Destacado); err != nil {
				pr.Close()
				return err
			}
			x.Final = precio
			if pct.Valid {
				x.Descuento = int(pct.Int64)
				x.Final = PrecioConOferta(precio, x.Descuento)
			}
			if key.Valid {
				x.Imagen = m.app.Archivos.URLPublica(key.String)
			}
			tiendas[i].Productos = append(tiendas[i].Productos, x)
		}
		pr.Close()
	}
	destacados, err := m.impulsados(ctx, q, 4)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"q": q, "destacados": destacados, "tiendas": tiendas})
	return nil
}
