package comprador

import (
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
	"github.com/solanchveliz-dev/vendigo/api/internal/productos"
)

// Fase 2 del comprador: favoritos, direcciones guardadas, avisos de sus pedidos y valoraciones.

func (m *Modulo) rutasFase2(r chi.Router) {
	r.Method("GET", "/favoritos", httpx.Handler(m.favoritos))
	r.Method("GET", "/favoritos/ids", httpx.Handler(m.favoritosIDs))
	r.Method("GET", "/ofertas", httpx.Handler(m.ofertas))
	r.Method("PUT", "/favoritos/{tipo}/{id}", httpx.Handler(m.marcarFavorito))
	r.Method("DELETE", "/favoritos/{tipo}/{id}", httpx.Handler(m.quitarFavorito))

	r.Method("GET", "/direcciones", httpx.Handler(m.direcciones))
	r.Method("POST", "/direcciones", httpx.Handler(m.guardarDireccion))
	r.Method("PUT", "/direcciones/{id}", httpx.Handler(m.guardarDireccion))
	r.Method("DELETE", "/direcciones/{id}", httpx.Handler(m.borrarDireccion))
	r.Method("POST", "/direcciones/{id}/principal", httpx.Handler(m.direccionPrincipal))

	r.Method("GET", "/notificaciones", httpx.Handler(m.notificaciones))
	r.Method("POST", "/notificaciones/leer", httpx.Handler(m.leerNotificaciones))

	r.Method("POST", "/productos/{id}/preguntas", httpx.Handler(m.preguntar))
	r.Method("GET", "/pedidos/{codigo}/valorar", httpx.Handler(m.paraValorar))
	r.Method("POST", "/pedidos/{codigo}/valorar", httpx.Handler(m.valorar))
}

func usuario(r *http.Request) string {
	u, _ := httpx.UsuarioDe(r.Context())
	return u.ID
}

// ---------- favoritos ----------

type TiendaFav struct {
	ID      string `json:"id"`
	Nombre  string `json:"nombre"`
	Slug    string `json:"slug"`
	Rubro   string `json:"rubro"`
	Lugar   string `json:"lugar"`
	LogoURL string `json:"logo_url"`
}

type ProductoFav struct {
	ID         string `json:"id"`
	Nombre     string `json:"nombre"`
	Precio     int    `json:"precio_centimos"`
	Final      int    `json:"precio_final_centimos"`
	ImagenURL  string `json:"imagen_url"`
	Tienda     string `json:"tienda"`
	TiendaSlug string `json:"tienda_slug"`
	Agotado    bool   `json:"agotado"`
}

// visible: la tienda se muestra a los compradores (las ocultas no salen en favoritos, pero el favorito no se borra).
const visible = `t.activa AND tienda_identidad_verificada(t.id)`

func (m *Modulo) tiendasSeguidas(r *http.Request, limite int) ([]TiendaFav, error) {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT t.id, t.nombre, t.slug, t.rubro,
		COALESCE(NULLIF(t.distrito,'')||', '||t.ciudad, t.ciudad), COALESCE(t.logo_key,'')
		FROM favoritos_tiendas f JOIN tiendas t ON t.id=f.tienda_id
		WHERE f.usuario_id=$1 AND `+visible+` ORDER BY f.creado_en DESC LIMIT $2`, usuario(r), limite)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TiendaFav{}
	for rows.Next() {
		var t TiendaFav
		var logo string
		if err := rows.Scan(&t.ID, &t.Nombre, &t.Slug, &t.Rubro, &t.Lugar, &logo); err != nil {
			return nil, err
		}
		if logo != "" {
			t.LogoURL = m.app.Archivos.URLPublica(logo)
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (m *Modulo) favoritos(w http.ResponseWriter, r *http.Request) error {
	tiendas, err := m.tiendasSeguidas(r, 200)
	if err != nil {
		return err
	}
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT p.id, p.nombre, p.precio_centimos, t.nombre, t.slug, p.stock <= 0,
		COALESCE((SELECT key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY orden LIMIT 1),''),
		(SELECT o.descuento_pct FROM ofertas o WHERE o.producto_id=p.id AND o.termina_en > now())
		FROM favoritos_productos f JOIN productos p ON p.id=f.producto_id JOIN tiendas t ON t.id=p.tienda_id
		WHERE f.usuario_id=$1 AND p.activo AND NOT p.eliminado AND `+visible+` ORDER BY f.creado_en DESC LIMIT 200`, usuario(r))
	if err != nil {
		return err
	}
	defer rows.Close()
	prods := []ProductoFav{}
	for rows.Next() {
		var p ProductoFav
		var img string
		var pct sql.NullInt64
		if err := rows.Scan(&p.ID, &p.Nombre, &p.Precio, &p.Tienda, &p.TiendaSlug, &p.Agotado, &img, &pct); err != nil {
			return err
		}
		p.Final = p.Precio
		if pct.Valid {
			p.Final = productos.PrecioConOferta(p.Precio, int(pct.Int64))
		}
		if img != "" {
			p.ImagenURL = m.app.Archivos.URLPublica(img)
		}
		prods = append(prods, p)
	}
	httpx.OK(w, map[string]any{"tiendas": tiendas, "productos": prods})
	return rows.Err()
}

// favoritosIDs: para pintar los corazones en las páginas de tienda y producto.
func (m *Modulo) favoritosIDs(w http.ResponseWriter, r *http.Request) error {
	ids := func(q string) ([]string, error) {
		rows, err := m.app.DB.QueryContext(r.Context(), q, usuario(r))
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []string{}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return nil, err
			}
			out = append(out, id)
		}
		return out, rows.Err()
	}
	t, err := ids(`SELECT tienda_id::text FROM favoritos_tiendas WHERE usuario_id=$1`)
	if err != nil {
		return err
	}
	p, err := ids(`SELECT producto_id::text FROM favoritos_productos WHERE usuario_id=$1`)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"tiendas": t, "productos": p})
	return nil
}

func tablaFavorito(tipo string) (tabla, col string, ok bool) {
	switch tipo {
	case "tiendas":
		return "favoritos_tiendas", "tienda_id", true
	case "productos":
		return "favoritos_productos", "producto_id", true
	}
	return "", "", false
}

func (m *Modulo) marcarFavorito(w http.ResponseWriter, r *http.Request) error {
	tabla, col, ok := tablaFavorito(chi.URLParam(r, "tipo"))
	if !ok {
		return httpx.ErrNoEncontrado
	}
	id := chi.URLParam(r, "id")
	// Solo tiendas y productos que el comprador puede ver.
	existe := `SELECT EXISTS(SELECT 1 FROM tiendas t WHERE t.id::text=$1 AND ` + visible + `)`
	if col == "producto_id" {
		existe = `SELECT EXISTS(SELECT 1 FROM productos p JOIN tiendas t ON t.id=p.tienda_id WHERE p.id::text=$1 AND p.activo AND NOT p.eliminado AND ` + visible + `)`
	}
	var hay bool
	if err := m.app.DB.QueryRowContext(r.Context(), existe, id).Scan(&hay); err != nil {
		return err
	}
	if !hay {
		return httpx.ErrNoEncontrado
	}
	if _, err := m.app.DB.ExecContext(r.Context(), `INSERT INTO `+tabla+` (usuario_id, `+col+`) VALUES ($1, $2) ON CONFLICT DO NOTHING`, usuario(r), id); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (m *Modulo) quitarFavorito(w http.ResponseWriter, r *http.Request) error {
	tabla, col, ok := tablaFavorito(chi.URLParam(r, "tipo"))
	if !ok {
		return httpx.ErrNoEncontrado
	}
	if _, err := m.app.DB.ExecContext(r.Context(), `DELETE FROM `+tabla+` WHERE usuario_id=$1 AND `+col+`::text=$2`, usuario(r), chi.URLParam(r, "id")); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---------- direcciones ----------

type Direccion struct {
	ID         string `json:"id"`
	Etiqueta   string `json:"etiqueta"`
	Direccion  string `json:"direccion"`
	Distrito   string `json:"distrito"`
	Ciudad     string `json:"ciudad"`
	Referencia string `json:"referencia"`
	Principal  bool   `json:"principal"`
}

const maxDirecciones = 10

func (m *Modulo) direcciones(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT id, etiqueta, direccion, distrito, ciudad, referencia, principal
		FROM direcciones WHERE usuario_id=$1 ORDER BY principal DESC, creado_en`, usuario(r))
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Direccion{}
	for rows.Next() {
		var d Direccion
		if err := rows.Scan(&d.ID, &d.Etiqueta, &d.Direccion, &d.Distrito, &d.Ciudad, &d.Referencia, &d.Principal); err != nil {
			return err
		}
		out = append(out, d)
	}
	httpx.OK(w, map[string]any{"direcciones": out})
	return rows.Err()
}

func (m *Modulo) guardarDireccion(w http.ResponseWriter, r *http.Request) error {
	var d Direccion
	if err := httpx.Leer(r, &d); err != nil {
		return err
	}
	limpio := func(s string, n int) string {
		s = strings.TrimSpace(s)
		if r := []rune(s); len(r) > n {
			s = string(r[:n])
		}
		return s
	}
	d.Etiqueta, d.Direccion, d.Distrito = limpio(d.Etiqueta, 30), limpio(d.Direccion, 160), limpio(d.Distrito, 60)
	d.Ciudad, d.Referencia = limpio(d.Ciudad, 60), limpio(d.Referencia, 160)
	if d.Etiqueta == "" {
		d.Etiqueta = "Casa"
	}
	if len([]rune(d.Direccion)) < 5 {
		return httpx.Invalido("Escribe la dirección (calle, número, interior).")
	}
	ctx := r.Context()
	uid := usuario(r)
	id := chi.URLParam(r, "id")
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var n int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM direcciones WHERE usuario_id=$1`, uid).Scan(&n); err != nil {
			return err
		}
		if id == "" {
			if n >= maxDirecciones {
				return httpx.Invalido("Puedes guardar hasta 10 direcciones.")
			}
			// La primera queda como principal.
			if err := tx.QueryRowContext(ctx, `INSERT INTO direcciones (usuario_id, etiqueta, direccion, distrito, ciudad, referencia, principal)
				VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, uid, d.Etiqueta, d.Direccion, d.Distrito, d.Ciudad, d.Referencia, n == 0).Scan(&d.ID); err != nil {
				return err
			}
		} else {
			res, err := tx.ExecContext(ctx, `UPDATE direcciones SET etiqueta=$3, direccion=$4, distrito=$5, ciudad=$6, referencia=$7
				WHERE id::text=$1 AND usuario_id=$2`, id, uid, d.Etiqueta, d.Direccion, d.Distrito, d.Ciudad, d.Referencia)
			if err != nil {
				return err
			}
			if k, _ := res.RowsAffected(); k == 0 {
				return httpx.ErrNoEncontrado
			}
			d.ID = id
		}
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

func (m *Modulo) borrarDireccion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	uid := usuario(r)
	return m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var principal bool
		err := tx.QueryRowContext(ctx, `DELETE FROM direcciones WHERE id::text=$1 AND usuario_id=$2 RETURNING principal`, chi.URLParam(r, "id"), uid).Scan(&principal)
		if core.SinFilas(err) {
			return httpx.ErrNoEncontrado
		}
		if err != nil {
			return err
		}
		// Si borró la principal, la más antigua pasa a serlo.
		if principal {
			if _, err := tx.ExecContext(ctx, `UPDATE direcciones SET principal=true WHERE id=(SELECT id FROM direcciones WHERE usuario_id=$1 ORDER BY creado_en LIMIT 1)`, uid); err != nil {
				return err
			}
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	})
}

func (m *Modulo) direccionPrincipal(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	uid := usuario(r)
	return m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var existe bool
		if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM direcciones WHERE id::text=$1 AND usuario_id=$2)`, chi.URLParam(r, "id"), uid).Scan(&existe); err != nil {
			return err
		}
		if !existe {
			return httpx.ErrNoEncontrado
		}
		if _, err := tx.ExecContext(ctx, `UPDATE direcciones SET principal=false WHERE usuario_id=$1 AND principal`, uid); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE direcciones SET principal=true WHERE id::text=$1`, chi.URLParam(r, "id")); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	})
}

// ---------- notificaciones ----------

type Notificacion struct {
	ID       string    `json:"id"`
	Titulo   string    `json:"titulo"`
	Cuerpo   string    `json:"cuerpo"`
	Enlace   string    `json:"enlace"`
	Leida    bool      `json:"leida"`
	CreadoEn time.Time `json:"creado_en"`
}

func (m *Modulo) notificaciones(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT id, titulo, cuerpo, enlace, leida, creado_en FROM notificaciones
		WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 100`, usuario(r))
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Notificacion{}
	noLeidas := 0
	for rows.Next() {
		var n Notificacion
		if err := rows.Scan(&n.ID, &n.Titulo, &n.Cuerpo, &n.Enlace, &n.Leida, &n.CreadoEn); err != nil {
			return err
		}
		if !n.Leida {
			noLeidas++
		}
		out = append(out, n)
	}
	httpx.OK(w, map[string]any{"notificaciones": out, "no_leidas": noLeidas})
	return rows.Err()
}

func (m *Modulo) leerNotificaciones(w http.ResponseWriter, r *http.Request) error {
	if _, err := m.app.DB.ExecContext(r.Context(), `UPDATE notificaciones SET leida=true WHERE usuario_id=$1 AND NOT leida`, usuario(r)); err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// ---------- valoraciones ----------

type ItemValorar struct {
	ProductoID string `json:"producto_id"`
	Nombre     string `json:"nombre"`
	Variante   string `json:"variante"`
	ImagenURL  string `json:"imagen_url"`
}

// pedidoValorable: el pedido es del comprador, está entregado y aún no tiene valoración.
func (m *Modulo) pedidoValorable(r *http.Request, q core.Ejecutor) (pid, tid, tienda, logo string, err error) {
	var estado string
	var valorado bool
	err = q.QueryRowContext(r.Context(), `SELECT p.id, p.tienda_id, t.nombre, COALESCE(t.logo_key,''), p.estado,
		EXISTS(SELECT 1 FROM valoraciones v WHERE v.pedido_id=p.id)
		FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id WHERE p.codigo=$1 AND p.comprador_id=$2`,
		chi.URLParam(r, "codigo"), usuario(r)).Scan(&pid, &tid, &tienda, &logo, &estado, &valorado)
	if core.SinFilas(err) {
		return "", "", "", "", httpx.ErrNoEncontrado
	}
	if err != nil {
		return
	}
	if estado != "entregado" {
		return "", "", "", "", httpx.Invalido("Podrás valorar tu pedido cuando lo recibas.")
	}
	if valorado {
		return "", "", "", "", httpx.Conflicto("ya_valorado", "Ya valoraste este pedido. ¡Gracias!")
	}
	return
}

func (m *Modulo) paraValorar(w http.ResponseWriter, r *http.Request) error {
	pid, _, tienda, logo, err := m.pedidoValorable(r, m.app.DB)
	if err != nil {
		return err
	}
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT DISTINCT ON (producto_id) producto_id::text, nombre, variante, COALESCE(imagen_key,'')
		FROM pedido_items WHERE pedido_id=$1 AND producto_id IS NOT NULL ORDER BY producto_id`, pid)
	if err != nil {
		return err
	}
	defer rows.Close()
	items := []ItemValorar{}
	for rows.Next() {
		var it ItemValorar
		var img string
		if err := rows.Scan(&it.ProductoID, &it.Nombre, &it.Variante, &img); err != nil {
			return err
		}
		if img != "" {
			it.ImagenURL = m.app.Archivos.URLPublica(img)
		}
		items = append(items, it)
	}
	logoURL := ""
	if logo != "" {
		logoURL = m.app.Archivos.URLPublica(logo)
	}
	httpx.OK(w, map[string]any{"codigo": chi.URLParam(r, "codigo"), "tienda": tienda, "tienda_logo": logoURL, "productos": items})
	return rows.Err()
}

func (m *Modulo) valorar(w http.ResponseWriter, r *http.Request) error {
	var in pedidos.NuevaValoracion
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	ctx := r.Context()
	uid := usuario(r)
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		pid, _, _, _, err := m.pedidoValorable(r, tx)
		if err != nil {
			return err
		}
		// La misma regla que desde el enlace de seguimiento (pedidos.GuardarValoracion).
		if err := pedidos.GuardarValoracion(ctx, tx, pid, &uid, in); err != nil {
			return err
		}
		m.app.Auditar(ctx, tx, uid, "valorar_pedido", "pedido", pid, map[string]int{"tienda": in.Tienda})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Calificación publicada. ¡Gracias!"})
	return nil
}

// ---------- preguntas a la tienda ----------

const maxPreguntasDia = 20

// preguntar publica la pregunta del comprador en el producto. Si la tienda la responde, le llega un aviso.
func (m *Modulo) preguntar(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Pregunta string `json:"pregunta"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	ctx := r.Context()
	uid := usuario(r)
	pid := chi.URLParam(r, "id")
	var nombre string
	var propia bool
	err := m.app.DB.QueryRowContext(ctx, `SELECT u.nombre, t.usuario_id=u.id FROM productos p JOIN tiendas t ON t.id=p.tienda_id, usuarios u
		WHERE p.id::text=$1 AND u.id=$2 AND p.activo AND NOT p.eliminado AND `+visible, pid, uid).Scan(&nombre, &propia)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	if propia {
		return httpx.Invalido("No puedes preguntar en tu propia tienda.")
	}
	var hoy int
	if err := m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM preguntas WHERE usuario_id=$1 AND creado_en > now() - interval '1 day'`, uid).Scan(&hoy); err != nil {
		return err
	}
	if hoy >= maxPreguntasDia {
		return httpx.NuevoError(http.StatusTooManyRequests, "muchas_preguntas", "Hiciste muchas preguntas hoy. Vuelve a intentarlo mañana.")
	}
	// En la página se muestra solo el primer nombre de quien pregunta.
	if err := productos.NuevaPregunta(ctx, m.app, pid, uid, strings.Fields(nombre + " Cliente")[0], in.Pregunta); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"mensaje": "Publicamos tu pregunta. Te avisaremos cuando la tienda responda."})
	return nil
}

// ---------- ofertas de las tiendas que sigue ----------

type Oferta struct {
	ID         string    `json:"id"`
	Nombre     string    `json:"nombre"`
	Precio     int       `json:"precio_centimos"`
	Final      int       `json:"precio_final_centimos"`
	Descuento  int       `json:"descuento_pct"`
	ImagenURL  string    `json:"imagen_url"`
	Tienda     string    `json:"tienda"`
	TiendaSlug string    `json:"tienda_slug"`
	TerminaEn  time.Time `json:"termina_en"`
}

// ofertas: los descuentos vigentes de las tiendas que el comprador sigue (primero los que terminan antes).
// Solo de esas tiendas: así "Ofertas" en su inicio es de quienes eligió seguir, no de cualquiera.
func (m *Modulo) ofertas(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT p.id, p.nombre, p.precio_centimos, o.descuento_pct, o.termina_en, t.nombre, t.slug,
		COALESCE((SELECT key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY orden LIMIT 1),'')
		FROM favoritos_tiendas f JOIN tiendas t ON t.id=f.tienda_id
		JOIN productos p ON p.tienda_id=t.id JOIN ofertas o ON o.producto_id=p.id
		WHERE f.usuario_id=$1 AND o.termina_en > now() AND o.inicia_en <= now()
		AND p.activo AND NOT p.eliminado AND p.stock > 0 AND `+visible+`
		ORDER BY o.termina_en LIMIT 20`, usuario(r))
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Oferta{}
	for rows.Next() {
		var o Oferta
		var img string
		if err := rows.Scan(&o.ID, &o.Nombre, &o.Precio, &o.Descuento, &o.TerminaEn, &o.Tienda, &o.TiendaSlug, &img); err != nil {
			return err
		}
		o.Final = productos.PrecioConOferta(o.Precio, o.Descuento)
		if img != "" {
			o.ImagenURL = m.app.Archivos.URLPublica(img)
		}
		out = append(out, o)
	}
	httpx.OK(w, map[string]any{"ofertas": out})
	return rows.Err()
}
