package admin

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

// Productos y pedidos de toda la plataforma. VendiGo modera las publicaciones
// (puede retirarlas con motivo) y consulta los pedidos; cada tienda gestiona su entrega.

type ProductoAdmin struct {
	ID        string    `json:"id"`
	Nombre    string    `json:"nombre"`
	Categoria string    `json:"categoria"`
	Precio    int       `json:"precio_centimos"`
	Stock     int       `json:"stock"`
	Estado    string    `json:"estado"` // publicado, agotado, pausado, retirado
	Motivo    string    `json:"retirado_motivo"`
	Oferta    int       `json:"oferta_pct"`
	ImagenURL string    `json:"imagen_url"`
	TiendaID  string    `json:"tienda_id"`
	Tienda    string    `json:"tienda"`
	Slug      string    `json:"slug"`
	Rubro     string    `json:"rubro"`
	CreadoEn  time.Time `json:"creado_en"`
}

const consultaProductos = `SELECT p.id, p.nombre, p.categoria, p.precio_centimos, p.stock,
	CASE WHEN p.retirado_motivo<>'' THEN 'retirado' WHEN NOT p.activo THEN 'pausado' WHEN p.stock=0 THEN 'agotado' ELSE 'publicado' END,
	p.retirado_motivo, COALESCE(o.descuento_pct,0),
	COALESCE((SELECT i.key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY i.orden LIMIT 1),''),
	t.id, t.nombre, t.slug, t.rubro, p.creado_en
	FROM productos p JOIN tiendas t ON t.id=p.tienda_id
	LEFT JOIN ofertas o ON o.producto_id=p.id AND o.termina_en > now()
	WHERE NOT p.eliminado`

func (m *Modulo) scanProducto(s interface{ Scan(...any) error }) (ProductoAdmin, error) {
	var p ProductoAdmin
	var img string
	err := s.Scan(&p.ID, &p.Nombre, &p.Categoria, &p.Precio, &p.Stock, &p.Estado, &p.Motivo, &p.Oferta, &img, &p.TiendaID, &p.Tienda, &p.Slug, &p.Rubro, &p.CreadoEn)
	if img != "" {
		p.ImagenURL = m.app.Archivos.URLPublica(img)
	}
	return p, err
}

func (m *Modulo) productos(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), consultaProductos+` ORDER BY t.nombre, p.creado_en DESC LIMIT 5000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []ProductoAdmin{}
	for rows.Next() {
		p, err := m.scanProducto(rows)
		if err != nil {
			return err
		}
		out = append(out, p)
	}
	httpx.OK(w, map[string]any{"productos": out})
	return nil
}

func (m *Modulo) producto(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	p, err := m.scanProducto(m.app.DB.QueryRowContext(ctx, consultaProductos+` AND p.id::text=$1`, chi.URLParam(r, "id")))
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	var info struct {
		Descripcion string     `json:"descripcion"`
		Vendidos    int        `json:"vendidos"`
		Visitas     int        `json:"visitas"`
		Reclamos    int        `json:"reclamos"`
		Variantes   []string   `json:"variantes"`
		Imagenes    []string   `json:"imagenes"`
		RetiradoEn  *time.Time `json:"retirado_en"`
	}
	m.app.DB.QueryRowContext(ctx, `SELECT p.descripcion, p.retirado_en,
		(SELECT COALESCE(SUM(i.cantidad),0) FROM pedido_items i JOIN pedidos pe ON pe.id=i.pedido_id WHERE i.producto_id=p.id AND pe.estado NOT IN ('rechazado','cancelado')),
		(SELECT COALESCE(SUM(v.cantidad),0) FROM visitas v WHERE v.producto_id=p.id),
		(SELECT count(DISTINCT c.id) FROM reclamos c JOIN pedido_items i ON i.pedido_id=c.pedido_id WHERE i.producto_id=p.id)
		FROM productos p WHERE p.id=$1`, p.ID).Scan(&info.Descripcion, &info.RetiradoEn, &info.Vendidos, &info.Visitas, &info.Reclamos)
	info.Variantes, info.Imagenes = []string{}, []string{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT nombre FROM producto_variantes WHERE producto_id=$1 ORDER BY orden`, p.ID); err == nil {
		for rows.Next() {
			var v string
			rows.Scan(&v)
			info.Variantes = append(info.Variantes, v)
		}
		rows.Close()
	}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT key FROM producto_imagenes WHERE producto_id=$1 ORDER BY orden`, p.ID); err == nil {
		for rows.Next() {
			var k string
			rows.Scan(&k)
			info.Imagenes = append(info.Imagenes, m.app.Archivos.URLPublica(k))
		}
		rows.Close()
	}
	httpx.OK(w, map[string]any{"producto": p, "info": info})
	return nil
}

// avisarDueno notifica a la dueña de la tienda del producto (los avisos de moderación siempre llegan).
func avisarDueno(r *http.Request, tx *sql.Tx, productoID, titulo, cuerpo string) error {
	_, err := tx.ExecContext(r.Context(), `INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo)
		SELECT t.usuario_id, $2, $3, '/vendedor/productos/'||p.id, 'inventario' FROM productos p JOIN tiendas t ON t.id=p.tienda_id WHERE p.id::text=$1`,
		productoID, titulo, cuerpo)
	return err
}

func (m *Modulo) retirarProducto(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	motivo, err := motivoObligatorio(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var nombre string
		err := tx.QueryRowContext(ctx, `UPDATE productos SET activo=false, retirado_motivo=$2, retirado_en=now(), actualizado_en=now()
			WHERE id::text=$1 AND NOT eliminado AND retirado_motivo='' RETURNING nombre`, id, motivo).Scan(&nombre)
		if core.SinFilas(err) {
			return httpx.Conflicto("no_aplica", "Esta publicación ya fue retirada.")
		}
		if err != nil {
			return err
		}
		if err := avisarDueno(r, tx, id, "Retiramos una publicación", "“"+nombre+"” ya no se ve en tu tienda. Motivo: "+conPunto(motivo)+" Si crees que es un error, escríbenos a "+m.correoSoporte(ctx)+"."); err != nil {
			return err
		}
		m.app.Auditar(ctx, tx, adminID(ctx), "retirar_producto", "producto", id, map[string]string{"motivo": motivo, "producto": nombre})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Publicación retirada. Ya no se ve en la tienda."})
	return nil
}

func (m *Modulo) restaurarProducto(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var nombre string
		// Vuelve pausada: la vendedora decide cuándo publicarla (así se respeta el límite de su plan).
		err := tx.QueryRowContext(ctx, `UPDATE productos SET retirado_motivo='', retirado_en=NULL, actualizado_en=now()
			WHERE id::text=$1 AND NOT eliminado AND retirado_motivo<>'' RETURNING nombre`, id).Scan(&nombre)
		if core.SinFilas(err) {
			return httpx.Conflicto("no_aplica", "Esta publicación no está retirada.")
		}
		if err != nil {
			return err
		}
		if err := avisarDueno(r, tx, id, "Ya puedes publicar otra vez", "Revisamos “"+nombre+"”. Quedó pausado: actívalo desde Productos cuando quieras."); err != nil {
			return err
		}
		m.app.Auditar(ctx, tx, adminID(ctx), "restaurar_producto", "producto", id, map[string]string{"producto": nombre})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Publicación habilitada. Quedó pausada hasta que la vendedora la active."})
	return nil
}

type PedidoAdmin struct {
	ID         string    `json:"id"`
	Codigo     string    `json:"codigo"`
	TiendaID   string    `json:"tienda_id"`
	Tienda     string    `json:"tienda"`
	Comprador  string    `json:"comprador"`
	Entrega    string    `json:"entrega"`
	Agencia    string    `json:"agencia"`
	Estado     string    `json:"estado"`
	PagoEstado string    `json:"pago_estado"`
	MetodoPago string    `json:"metodo_pago"`
	Total      int       `json:"total_centimos"`
	Reclamo    *string   `json:"reclamo"`
	CreadoEn   time.Time `json:"creado_en"`
}

func (m *Modulo) pedidosAdmin(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT p.id, p.codigo, t.id, t.nombre, p.comprador_nombre, p.entrega,
		COALESCE(NULLIF(e.agencia,''), p.agencia), p.estado, p.pago_estado, p.metodo_pago, p.total_centimos, c.estado, p.creado_en
		FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id
		LEFT JOIN envios e ON e.pedido_id=p.id LEFT JOIN reclamos c ON c.pedido_id=p.id
		ORDER BY p.creado_en DESC LIMIT 5000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []PedidoAdmin{}
	for rows.Next() {
		var p PedidoAdmin
		if err := rows.Scan(&p.ID, &p.Codigo, &p.TiendaID, &p.Tienda, &p.Comprador, &p.Entrega, &p.Agencia, &p.Estado, &p.PagoEstado, &p.MetodoPago, &p.Total, &p.Reclamo, &p.CreadoEn); err != nil {
			return err
		}
		out = append(out, p)
	}
	httpx.OK(w, map[string]any{"pedidos": out})
	return nil
}

func (m *Modulo) pedidoAdmin(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	d, tid, err := pedidos.CargarComoAdmin(ctx, m.app, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	var extra struct {
		TiendaID    string  `json:"tienda_id"`
		Tienda      string  `json:"tienda"`
		Transaccion *string `json:"transaccion"`
	}
	extra.TiendaID = tid
	m.app.DB.QueryRowContext(ctx, `SELECT t.nombre, p.culqi_cargo_id FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id WHERE p.id=$1`, d.ID).Scan(&extra.Tienda, &extra.Transaccion)
	httpx.OK(w, map[string]any{"pedido": d, "extra": extra})
	return nil
}

// conPunto cierra la frase del motivo para que el aviso se lea bien.
func conPunto(s string) string {
	if strings.HasSuffix(s, ".") || strings.HasSuffix(s, "!") || strings.HasSuffix(s, "?") {
		return s
	}
	return s + "."
}
