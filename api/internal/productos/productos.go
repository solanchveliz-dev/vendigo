package productos

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

type Modulo struct{ app *core.App }

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

func (m *Modulo) RutasVendedor(r chi.Router) {
	r.Method("GET", "/productos", httpx.Handler(m.listar))
	r.Method("POST", "/productos", httpx.Handler(m.crear))
	r.Method("GET", "/productos/{id}", httpx.Handler(m.obtener))
	r.Method("PUT", "/productos/{id}", httpx.Handler(m.actualizar))
	r.Method("PATCH", "/productos/{id}/estado", httpx.Handler(m.cambiarEstado))
	r.Method("DELETE", "/productos/{id}", httpx.Handler(m.eliminar))
	r.Method("PUT", "/productos/{id}/oferta", httpx.Handler(m.ponerOferta))
	r.Method("DELETE", "/productos/{id}/oferta", httpx.Handler(m.quitarOferta))
	r.Method("GET", "/preguntas", httpx.Handler(m.preguntas))
	r.Method("POST", "/preguntas/{id}/responder", httpx.Handler(m.responder))
}

func (m *Modulo) RutasPublicas(r chi.Router) {
	r.Method("GET", "/tiendas/{slug}/productos", httpx.Handler(m.catalogoPublico))
}

const maxImagenes = 6

type Variante struct {
	ID     string `json:"id,omitempty"`
	Nombre string `json:"nombre"`
	Stock  int    `json:"stock"`
	Precio *int   `json:"precio_centimos"`
}

type Imagen struct {
	Key string `json:"key"`
	URL string `json:"url"`
}

type Oferta struct {
	DescuentoPct int       `json:"descuento_pct"`
	TerminaEn    time.Time `json:"termina_en"`
	PrecioFinal  int       `json:"precio_final_centimos"`
}

type Producto struct {
	ID          string     `json:"id"`
	Nombre      string     `json:"nombre"`
	Descripcion string     `json:"descripcion"`
	Categoria   string     `json:"categoria"`
	Precio      int        `json:"precio_centimos"`
	Stock       int        `json:"stock"`
	Activo      bool       `json:"activo"`
	Variantes   []Variante `json:"variantes"`
	Imagenes    []Imagen   `json:"imagenes"`
	Oferta      *Oferta    `json:"oferta"`
	Vendidos    int        `json:"vendidos"`
	CreadoEn    time.Time  `json:"creado_en"`
}

// PrecioConOferta redondea al sol más cercano hacia abajo en céntimos de 10.
func PrecioConOferta(precio, pct int) int {
	p := precio * (100 - pct) / 100
	return p - p%10
}

func (m *Modulo) cargar(ctx context.Context, tiendaID string, ids ...string) ([]Producto, error) {
	if len(ids) == 0 {
		return []Producto{}, nil
	}
	ph := make([]string, len(ids))
	args := []any{tiendaID}
	for i, id := range ids {
		ph[i] = fmt.Sprintf("$%d", i+2)
		args = append(args, id)
	}
	in := strings.Join(ph, ",")
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.nombre, p.descripcion, p.categoria, p.precio_centimos, p.stock, p.activo, p.creado_en,
		o.descuento_pct, o.termina_en, 0
		FROM productos p LEFT JOIN ofertas o ON o.producto_id=p.id AND o.termina_en > now()
		WHERE p.tienda_id=$1 AND NOT p.eliminado AND p.id::text IN (`+in+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	por := map[string]*Producto{}
	for rows.Next() {
		var p Producto
		var pct sql.NullInt64
		var termina sql.NullTime
		if err := rows.Scan(&p.ID, &p.Nombre, &p.Descripcion, &p.Categoria, &p.Precio, &p.Stock, &p.Activo, &p.CreadoEn, &pct, &termina, &p.Vendidos); err != nil {
			return nil, err
		}
		if pct.Valid {
			p.Oferta = &Oferta{DescuentoPct: int(pct.Int64), TerminaEn: termina.Time, PrecioFinal: PrecioConOferta(p.Precio, int(pct.Int64))}
		}
		p.Variantes, p.Imagenes = []Variante{}, []Imagen{}
		por[p.ID] = &p
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	args = args[1:]
	ph2 := make([]string, len(ids))
	for i := range ids {
		ph2[i] = fmt.Sprintf("$%d", i+1)
	}
	in2 := strings.Join(ph2, ",")

	vr, err := m.app.DB.QueryContext(ctx, `SELECT id, producto_id, nombre, stock, precio_centimos FROM producto_variantes
		WHERE producto_id::text IN (`+in2+`) ORDER BY orden`, args...)
	if err != nil {
		return nil, err
	}
	for vr.Next() {
		var v Variante
		var pid string
		var precio sql.NullInt64
		if err := vr.Scan(&v.ID, &pid, &v.Nombre, &v.Stock, &precio); err != nil {
			vr.Close()
			return nil, err
		}
		if precio.Valid {
			n := int(precio.Int64)
			v.Precio = &n
		}
		if p := por[pid]; p != nil {
			p.Variantes = append(p.Variantes, v)
		}
	}
	vr.Close()

	ir, err := m.app.DB.QueryContext(ctx, `SELECT producto_id, key FROM producto_imagenes WHERE producto_id::text IN (`+in2+`) ORDER BY orden`, args...)
	if err != nil {
		return nil, err
	}
	for ir.Next() {
		var pid, key string
		if err := ir.Scan(&pid, &key); err != nil {
			ir.Close()
			return nil, err
		}
		if p := por[pid]; p != nil {
			p.Imagenes = append(p.Imagenes, Imagen{Key: key, URL: m.app.Archivos.URLPublica(key)})
		}
	}
	ir.Close()

	out := make([]Producto, 0, len(ids))
	for _, id := range ids {
		if p := por[id]; p != nil {
			out = append(out, *p)
		}
	}
	return out, nil
}

// ---------- listar ----------

func (m *Modulo) listar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	filtro := r.URL.Query().Get("filtro")
	where := "tienda_id=$1 AND NOT eliminado AND ($2='' OR nombre ILIKE '%'||$2||'%')"
	switch filtro {
	case "activos":
		where += " AND activo"
	case "pausados":
		where += " AND NOT activo"
	case "sin_stock":
		where += " AND stock=0"
	case "stock_bajo":
		where += " AND stock <= 3"
	case "en_oferta":
		where += " AND EXISTS(SELECT 1 FROM ofertas o WHERE o.producto_id=productos.id AND o.termina_en > now())"
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id FROM productos WHERE `+where+` ORDER BY creado_en DESC LIMIT 200`, tid, q)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	lista, err := m.cargar(ctx, tid, ids...)
	if err != nil {
		return err
	}
	var conteo struct {
		Todos, Activos, Pausados, SinStock, EnOferta int
	}
	m.app.DB.QueryRowContext(ctx, `SELECT count(*), count(*) FILTER (WHERE activo), count(*) FILTER (WHERE NOT activo),
		count(*) FILTER (WHERE stock=0),
		count(*) FILTER (WHERE EXISTS(SELECT 1 FROM ofertas o WHERE o.producto_id=productos.id AND o.termina_en > now()))
		FROM productos WHERE tienda_id=$1 AND NOT eliminado`, tid).Scan(&conteo.Todos, &conteo.Activos, &conteo.Pausados, &conteo.SinStock, &conteo.EnOferta)
	httpx.OK(w, map[string]any{"productos": lista, "conteo": map[string]int{
		"todos": conteo.Todos, "activos": conteo.Activos, "pausados": conteo.Pausados, "sin_stock": conteo.SinStock, "en_oferta": conteo.EnOferta}})
	return nil
}

func (m *Modulo) obtener(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	l, err := m.cargar(ctx, tid, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	if len(l) == 0 {
		return httpx.ErrNoEncontrado
	}
	httpx.OK(w, l[0])
	return nil
}

// ---------- crear y editar ----------

type datosProducto struct {
	Nombre      string     `json:"nombre"`
	Descripcion string     `json:"descripcion"`
	Categoria   string     `json:"categoria"`
	Precio      int        `json:"precio_centimos"`
	Stock       int        `json:"stock"`
	Activo      *bool      `json:"activo"`
	Variantes   []Variante `json:"variantes"`
	Imagenes    []string   `json:"imagenes"`
}

func (d *datosProducto) validar(tiendaID string) error {
	d.Nombre = strings.TrimSpace(d.Nombre)
	d.Descripcion = strings.TrimSpace(d.Descripcion)
	d.Categoria = strings.TrimSpace(d.Categoria)
	if n := len([]rune(d.Nombre)); n < 3 || n > 80 {
		return httpx.Invalido("El nombre debe tener entre 3 y 80 caracteres.")
	}
	if len([]rune(d.Descripcion)) > 2000 {
		return httpx.Invalido("La descripción puede tener hasta 2000 caracteres.")
	}
	if d.Precio < 100 || d.Precio > 5000000 {
		return httpx.Invalido("El precio debe estar entre S/ 1 y S/ 50 000.")
	}
	if d.Stock < 0 || d.Stock > 100000 {
		return httpx.Invalido("El stock no es válido.")
	}
	if len(d.Imagenes) == 0 {
		return httpx.Invalido("Agrega al menos una foto del producto.")
	}
	if len(d.Imagenes) > maxImagenes {
		return httpx.Invalido(fmt.Sprintf("Puedes subir hasta %d fotos.", maxImagenes))
	}
	for _, k := range d.Imagenes {
		if !strings.HasPrefix(k, "producto/"+tiendaID+"/") {
			return httpx.Invalido("Una de las fotos no pertenece a tu tienda.")
		}
	}
	if len(d.Variantes) > 30 {
		return httpx.Invalido("Puedes tener hasta 30 variantes.")
	}
	vistos := map[string]bool{}
	total := 0
	for i := range d.Variantes {
		v := &d.Variantes[i]
		v.Nombre = strings.TrimSpace(v.Nombre)
		if v.Nombre == "" {
			return httpx.Invalido("Cada variante necesita un nombre (por ejemplo: Talla M).")
		}
		if vistos[strings.ToLower(v.Nombre)] {
			return httpx.Invalido("Hay variantes repetidas: " + v.Nombre)
		}
		vistos[strings.ToLower(v.Nombre)] = true
		if v.Stock < 0 {
			return httpx.Invalido("El stock de una variante no es válido.")
		}
		if v.Precio != nil && *v.Precio < 100 {
			return httpx.Invalido("El precio de una variante no es válido.")
		}
		total += v.Stock
	}
	if len(d.Variantes) > 0 {
		d.Stock = total
	}
	return nil
}

func (m *Modulo) guardarHijos(ctx context.Context, tx *sql.Tx, pid string, d datosProducto) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM producto_variantes WHERE producto_id=$1`, pid); err != nil {
		return err
	}
	for i, v := range d.Variantes {
		if _, err := tx.ExecContext(ctx, `INSERT INTO producto_variantes (producto_id, nombre, stock, precio_centimos, orden) VALUES ($1,$2,$3,$4,$5)`,
			pid, v.Nombre, v.Stock, v.Precio, i); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM producto_imagenes WHERE producto_id=$1`, pid); err != nil {
		return err
	}
	for i, k := range d.Imagenes {
		if _, err := tx.ExecContext(ctx, `INSERT INTO producto_imagenes (producto_id, key, orden) VALUES ($1,$2,$3)`, pid, k, i); err != nil {
			return err
		}
	}
	return nil
}

func (m *Modulo) crear(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in datosProducto
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if err := in.validar(tid); err != nil {
		return err
	}
	activo := in.Activo == nil || *in.Activo
	var pid string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if err := tx.QueryRowContext(ctx, `INSERT INTO productos (tienda_id, nombre, descripcion, categoria, precio_centimos, stock, activo)
			VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, tid, in.Nombre, in.Descripcion, in.Categoria, in.Precio, in.Stock, activo).Scan(&pid); err != nil {
			return err
		}
		return m.guardarHijos(ctx, tx, pid, in)
	})
	if err != nil {
		return err
	}
	l, err := m.cargar(ctx, tid, pid)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, l[0])
	return nil
}

func (m *Modulo) propio(ctx context.Context, tid, pid string) error {
	var ok bool
	m.app.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM productos WHERE id::text=$1 AND tienda_id=$2 AND NOT eliminado)`, pid, tid).Scan(&ok)
	if !ok {
		return httpx.ErrNoEncontrado
	}
	return nil
}

func (m *Modulo) actualizar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	pid := chi.URLParam(r, "id")
	if err := m.propio(ctx, tid, pid); err != nil {
		return err
	}
	var in datosProducto
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if err := in.validar(tid); err != nil {
		return err
	}
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE productos SET nombre=$2, descripcion=$3, categoria=$4, precio_centimos=$5, stock=$6,
			activo=COALESCE($7, activo), actualizado_en=now() WHERE id=$1`,
			pid, in.Nombre, in.Descripcion, in.Categoria, in.Precio, in.Stock, in.Activo); err != nil {
			return err
		}
		return m.guardarHijos(ctx, tx, pid, in)
	})
	if err != nil {
		return err
	}
	return m.obtener(w, r)
}

func (m *Modulo) cambiarEstado(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	pid := chi.URLParam(r, "id")
	if err := m.propio(ctx, tid, pid); err != nil {
		return err
	}
	var in struct {
		Activo bool `json:"activo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE productos SET activo=$2, actualizado_en=now() WHERE id=$1`, pid, in.Activo); err != nil {
		return err
	}
	return m.obtener(w, r)
}

func (m *Modulo) eliminar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	pid := chi.URLParam(r, "id")
	if err := m.propio(ctx, tid, pid); err != nil {
		return err
	}
	// Se conserva el registro para no romper los pedidos que ya lo incluyen.
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE productos SET eliminado=true, activo=false, actualizado_en=now() WHERE id=$1`, pid); err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Producto eliminado."})
	return nil
}

// ---------- ofertas ----------

func (m *Modulo) ponerOferta(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	pid := chi.URLParam(r, "id")
	if err := m.propio(ctx, tid, pid); err != nil {
		return err
	}
	var in struct {
		DescuentoPct int `json:"descuento_pct"`
		Dias         int `json:"dias"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if in.DescuentoPct < 5 || in.DescuentoPct > 90 {
		return httpx.Invalido("El descuento debe estar entre 5 % y 90 %.")
	}
	if in.Dias < 1 || in.Dias > 30 {
		return httpx.Invalido("La oferta puede durar de 1 a 30 días.")
	}
	termina := time.Now().AddDate(0, 0, in.Dias)
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO ofertas (producto_id, descuento_pct, termina_en) VALUES ($1,$2,$3)
		ON CONFLICT (producto_id) DO UPDATE SET descuento_pct=$2, inicia_en=now(), termina_en=$3`, pid, in.DescuentoPct, termina); err != nil {
		return err
	}
	return m.obtener(w, r)
}

func (m *Modulo) quitarOferta(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	pid := chi.URLParam(r, "id")
	if err := m.propio(ctx, tid, pid); err != nil {
		return err
	}
	if _, err := m.app.DB.ExecContext(ctx, `DELETE FROM ofertas WHERE producto_id=$1`, pid); err != nil {
		return err
	}
	return m.obtener(w, r)
}

// ---------- preguntas de compradores ----------

type Pregunta struct {
	ID           string     `json:"id"`
	ProductoID   string     `json:"producto_id"`
	Producto     string     `json:"producto"`
	Autor        string     `json:"autor"`
	Pregunta     string     `json:"pregunta"`
	Respuesta    *string    `json:"respuesta"`
	RespondidaEn *time.Time `json:"respondida_en"`
	CreadoEn     time.Time  `json:"creado_en"`
}

func (m *Modulo) preguntas(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	pendientes := r.URL.Query().Get("estado") != "respondidas"
	rows, err := m.app.DB.QueryContext(ctx, `SELECT q.id, p.id, p.nombre, q.autor_nombre, q.pregunta, q.respuesta, q.respondida_en, q.creado_en
		FROM preguntas q JOIN productos p ON p.id=q.producto_id
		WHERE p.tienda_id=$1 AND (q.respuesta IS NULL) = $2 ORDER BY q.creado_en DESC LIMIT 100`, tid, pendientes)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Pregunta{}
	for rows.Next() {
		var q Pregunta
		if err := rows.Scan(&q.ID, &q.ProductoID, &q.Producto, &q.Autor, &q.Pregunta, &q.Respuesta, &q.RespondidaEn, &q.CreadoEn); err != nil {
			return err
		}
		out = append(out, q)
	}
	var pend int
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM preguntas q JOIN productos p ON p.id=q.producto_id WHERE p.tienda_id=$1 AND q.respuesta IS NULL`, tid).Scan(&pend)
	httpx.OK(w, map[string]any{"preguntas": out, "pendientes": pend})
	return nil
}

func (m *Modulo) responder(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Respuesta string `json:"respuesta"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Respuesta = strings.TrimSpace(in.Respuesta)
	if n := len([]rune(in.Respuesta)); n < 2 || n > 500 {
		return httpx.Invalido("La respuesta debe tener entre 2 y 500 caracteres.")
	}
	res, err := m.app.DB.ExecContext(ctx, `UPDATE preguntas q SET respuesta=$3, respondida_en=now()
		FROM productos p WHERE q.id::text=$1 AND p.id=q.producto_id AND p.tienda_id=$2`, chi.URLParam(r, "id"), tid, in.Respuesta)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNoEncontrado
	}
	httpx.OK(w, map[string]string{"mensaje": "Respuesta publicada."})
	return nil
}

// ---------- catálogo público ----------

func (m *Modulo) catalogoPublico(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var tid string
	err := m.app.DB.QueryRowContext(ctx, `SELECT id FROM tiendas WHERE slug=$1 AND activa`, chi.URLParam(r, "slug")).Scan(&tid)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id FROM productos WHERE tienda_id=$1 AND activo AND NOT eliminado ORDER BY creado_en DESC LIMIT 200`, tid)
	if err != nil {
		return err
	}
	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()
	l, err := m.cargar(ctx, tid, ids...)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"productos": l})
	return nil
}
