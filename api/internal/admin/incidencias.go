package admin

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

var (
	tiposIncidencia    = map[string]bool{"entrega": true, "producto": true, "pago": true, "publicacion": true, "cuenta": true, "otro": true}
	prioridades        = map[string]bool{"alta": true, "media": true, "baja": true}
	estadosIncidencia  = map[string]bool{"abierta": true, "en_revision": true, "resuelta": true}
	origenesIncidencia = map[string]bool{"comprador": true, "vendedor": true, "equipo": true}
)

type Incidencia struct {
	ID          string     `json:"id"`
	Numero      int64      `json:"numero"`
	Titulo      string     `json:"titulo"`
	Descripcion string     `json:"descripcion"`
	Tipo        string     `json:"tipo"`
	Prioridad   string     `json:"prioridad"`
	Estado      string     `json:"estado"`
	Origen      string     `json:"origen"`
	Reportado   string     `json:"reportado_por"`
	TiendaID    *string    `json:"tienda_id"`
	Tienda      *string    `json:"tienda"`
	PedidoID    *string    `json:"pedido_id"`
	Pedido      *string    `json:"pedido"`
	CreadoEn    time.Time  `json:"creado_en"`
	ResueltaEn  *time.Time `json:"resuelta_en"`
}

const consultaIncidencias = `SELECT i.id, i.numero, i.titulo, i.descripcion, i.tipo, i.prioridad, i.estado, i.origen, i.reportado_por,
	i.tienda_id, t.nombre, i.pedido_id, p.codigo, i.creado_en, i.resuelta_en
	FROM incidencias i LEFT JOIN tiendas t ON t.id=i.tienda_id LEFT JOIN pedidos p ON p.id=i.pedido_id`

func scanIncidencia(s interface{ Scan(...any) error }) (Incidencia, error) {
	var i Incidencia
	err := s.Scan(&i.ID, &i.Numero, &i.Titulo, &i.Descripcion, &i.Tipo, &i.Prioridad, &i.Estado, &i.Origen, &i.Reportado,
		&i.TiendaID, &i.Tienda, &i.PedidoID, &i.Pedido, &i.CreadoEn, &i.ResueltaEn)
	return i, err
}

func (m *Modulo) incidencias(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), consultaIncidencias+` ORDER BY i.estado='resuelta', CASE i.prioridad WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, i.creado_en DESC LIMIT 5000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Incidencia{}
	for rows.Next() {
		i, err := scanIncidencia(rows)
		if err != nil {
			return err
		}
		out = append(out, i)
	}
	httpx.OK(w, map[string]any{"incidencias": out})
	return nil
}

func (m *Modulo) crearIncidencia(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Titulo      string `json:"titulo"`
		Descripcion string `json:"descripcion"`
		Tipo        string `json:"tipo"`
		Prioridad   string `json:"prioridad"`
		Origen      string `json:"origen"`
		Pedido      string `json:"pedido"` // código VG-… (opcional)
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Titulo, in.Descripcion, in.Pedido = strings.TrimSpace(in.Titulo), strings.TrimSpace(in.Descripcion), strings.ToUpper(strings.TrimSpace(in.Pedido))
	switch {
	case len([]rune(in.Titulo)) < 5 || len([]rune(in.Titulo)) > 120:
		return httpx.Invalido("El título debe tener entre 5 y 120 caracteres.")
	case len([]rune(in.Descripcion)) < 10 || len([]rune(in.Descripcion)) > 2000:
		return httpx.Invalido("Describe la incidencia (10 a 2000 caracteres).")
	case !tiposIncidencia[in.Tipo] || !prioridades[in.Prioridad] || !origenesIncidencia[in.Origen]:
		return httpx.Invalido("Elige el tipo, la prioridad y quién la reporta.")
	}
	var pedidoID, tiendaID sql.NullString
	var comprador, duena string
	if in.Pedido != "" {
		err := m.app.DB.QueryRowContext(ctx, `SELECT p.id, p.tienda_id, p.comprador_nombre, u.nombre FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id JOIN usuarios u ON u.id=t.usuario_id WHERE p.codigo=$1`, in.Pedido).
			Scan(&pedidoID, &tiendaID, &comprador, &duena)
		if core.SinFilas(err) {
			return httpx.Invalido("No existe el pedido " + in.Pedido + ".")
		}
		if err != nil {
			return err
		}
	}
	// Quién la reporta: el comprador o la dueña del pedido, o el admin que la abre.
	u, _ := httpx.UsuarioDe(ctx)
	var adminNombre string
	m.app.DB.QueryRowContext(ctx, `SELECT nombre FROM usuarios WHERE id=$1`, u.ID).Scan(&adminNombre)
	reporta := firmaEquipo(adminNombre)
	if in.Origen == "comprador" && comprador != "" {
		reporta = comprador
	} else if in.Origen == "vendedor" && duena != "" {
		reporta = duena
	} else if in.Origen != "equipo" {
		reporta = map[string]string{"comprador": "Comprador", "vendedor": "Vendedora"}[in.Origen] + " (sin pedido)"
	}
	var id string
	var numero int64
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if err := tx.QueryRowContext(ctx, `INSERT INTO incidencias (titulo, descripcion, tipo, prioridad, origen, reportado_por, tienda_id, pedido_id, creado_por)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, numero`, in.Titulo, in.Descripcion, in.Tipo, in.Prioridad, in.Origen, reporta, tiendaID, pedidoID, u.ID).Scan(&id, &numero); err != nil {
			return err
		}
		m.app.Auditar(ctx, tx, u.ID, "abrir_incidencia", "incidencia", id, map[string]any{"numero": numero, "pedido": in.Pedido})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"mensaje": "Incidencia abierta.", "numero": numero})
	return nil
}

func numeroIncidencia(r *http.Request) (int64, error) {
	v := strings.TrimPrefix(strings.ToUpper(chi.URLParam(r, "n")), "INC-")
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, httpx.ErrNoEncontrado
	}
	return n, nil
}

func (m *Modulo) incidencia(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	n, err := numeroIncidencia(r)
	if err != nil {
		return err
	}
	i, err := scanIncidencia(m.app.DB.QueryRowContext(ctx, consultaIncidencias+` WHERE i.numero=$1`, n))
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	type nota struct {
		Autor    string    `json:"autor"`
		Texto    string    `json:"texto"`
		CreadoEn time.Time `json:"creado_en"`
	}
	notas := []nota{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT autor, texto, creado_en FROM incidencia_notas WHERE incidencia_id=$1 ORDER BY creado_en, id`, i.ID); err == nil {
		for rows.Next() {
			var x nota
			rows.Scan(&x.Autor, &x.Texto, &x.CreadoEn)
			notas = append(notas, x)
		}
		rows.Close()
	}
	httpx.OK(w, map[string]any{"incidencia": i, "notas": notas})
	return nil
}

func (m *Modulo) estadoIncidencia(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	n, err := numeroIncidencia(r)
	if err != nil {
		return err
	}
	var in struct {
		Estado string `json:"estado"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if !estadosIncidencia[in.Estado] {
		return httpx.Invalido("Estado no válido.")
	}
	var id string
	err = m.app.DB.QueryRowContext(ctx, `UPDATE incidencias SET estado=$2, resuelta_en=CASE WHEN $2='resuelta' THEN now() ELSE NULL END
		WHERE numero=$1 AND estado<>$2 RETURNING id`, n, in.Estado).Scan(&id)
	if core.SinFilas(err) {
		return httpx.Conflicto("no_aplica", "La incidencia ya tiene ese estado.")
	}
	if err != nil {
		return err
	}
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "estado_incidencia", "incidencia", id, map[string]string{"estado": in.Estado})
	httpx.OK(w, map[string]string{"mensaje": "Estado actualizado."})
	return nil
}

func (m *Modulo) notaIncidencia(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	n, err := numeroIncidencia(r)
	if err != nil {
		return err
	}
	var in struct {
		Texto string `json:"texto"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Texto = strings.TrimSpace(in.Texto)
	if len([]rune(in.Texto)) < 3 || len([]rune(in.Texto)) > 2000 {
		return httpx.Invalido("Escribe la nota (3 a 2000 caracteres).")
	}
	res, err := m.app.DB.ExecContext(ctx, `INSERT INTO incidencia_notas (incidencia_id, autor_id, autor, texto)
		SELECT i.id, u.id, CASE WHEN u.nombre ILIKE 'equipo vendigo%' THEN u.nombre ELSE 'Equipo VendiGo · '||u.nombre END, $3 FROM incidencias i, usuarios u WHERE i.numero=$1 AND u.id=$2`, n, adminID(ctx), in.Texto)
	if err != nil {
		return err
	}
	if c, _ := res.RowsAffected(); c == 0 {
		return httpx.ErrNoEncontrado
	}
	httpx.OK(w, map[string]string{"mensaje": "Nota agregada."})
	return nil
}

// firmaEquipo muestra "Equipo VendiGo · Nombre" sin repetir si la cuenta ya se llama así.
func firmaEquipo(nombre string) string {
	if nombre == "" || strings.HasPrefix(strings.ToLower(nombre), "equipo vendigo") {
		return "Equipo VendiGo"
	}
	return "Equipo VendiGo · " + nombre
}
