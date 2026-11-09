package pedidos

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// Clientes: quiénes le compran a la tienda y cada cuánto. Sale de los pedidos reales
// (no hay una lista aparte). Cada cliente se identifica por la huella de su celular.

type Cliente struct {
	ID         string    `json:"id"`
	Nombre     string    `json:"nombre"`
	Celular    string    `json:"celular"`
	Lugar      string    `json:"lugar"`
	Pedidos    int       `json:"pedidos"`
	Total      int       `json:"total_centimos"`
	Primera    time.Time `json:"primera_compra"`
	Ultima     time.Time `json:"ultima_compra"`
	Frecuencia string    `json:"frecuencia"` // nueva, ocasional, mensual, frecuente
	Meses      int       `json:"-"`
}

func frecuencia(pedidos, meses int) string {
	switch {
	case pedidos <= 1:
		return "nueva"
	case pedidos >= 4:
		return "frecuente"
	case meses >= 2:
		return "mensual"
	}
	return "ocasional"
}

const consultaClientes = `SELECT md5(comprador_celular), comprador_celular,
	(array_agg(comprador_nombre ORDER BY creado_en DESC))[1],
	(array_agg(NULLIF(COALESCE(NULLIF(distrito,''), ciudad),'') ORDER BY creado_en DESC) FILTER (WHERE COALESCE(NULLIF(distrito,''), ciudad) <> ''))[1],
	count(*) FILTER (WHERE estado NOT IN ('rechazado','cancelado')),
	COALESCE(SUM(total_centimos) FILTER (WHERE estado NOT IN ('rechazado','cancelado')), 0),
	min(creado_en), max(creado_en),
	count(DISTINCT date_trunc('month', creado_en AT TIME ZONE 'America/Lima')) FILTER (WHERE estado NOT IN ('rechazado','cancelado'))
	FROM pedidos WHERE tienda_id=$1`

func (m *Modulo) clientes(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	rows, err := m.app.DB.QueryContext(ctx, consultaClientes+` GROUP BY comprador_celular ORDER BY max(creado_en) DESC LIMIT 500`, tid)
	if err != nil {
		return err
	}
	defer rows.Close()
	q := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	f := r.URL.Query().Get("frecuencia")
	out := []Cliente{}
	for rows.Next() {
		var c Cliente
		var lugar *string
		rows.Scan(&c.ID, &c.Celular, &c.Nombre, &lugar, &c.Pedidos, &c.Total, &c.Primera, &c.Ultima, &c.Meses)
		if lugar != nil {
			c.Lugar = *lugar
		}
		c.Frecuencia = frecuencia(c.Pedidos, c.Meses)
		if q != "" && !strings.Contains(strings.ToLower(c.Nombre), q) && !strings.Contains(c.Celular, q) {
			continue
		}
		if f != "" && f != c.Frecuencia {
			continue
		}
		out = append(out, c)
	}
	httpx.OK(w, map[string]any{"clientes": out})
	return nil
}

func (m *Modulo) cliente(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	var c Cliente
	var lugar *string
	err = m.app.DB.QueryRowContext(ctx, consultaClientes+` AND md5(comprador_celular)=$2 GROUP BY comprador_celular`, tid, id).
		Scan(&c.ID, &c.Celular, &c.Nombre, &lugar, &c.Pedidos, &c.Total, &c.Primera, &c.Ultima, &c.Meses)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	if lugar != nil {
		c.Lugar = *lugar
	}
	c.Frecuencia = frecuencia(c.Pedidos, c.Meses)

	var correo, nota string
	m.app.DB.QueryRowContext(ctx, `SELECT COALESCE(u.email,'') FROM pedidos p JOIN usuarios u ON u.id=p.comprador_id
		WHERE p.tienda_id=$1 AND md5(p.comprador_celular)=$2 AND u.email IS NOT NULL ORDER BY p.creado_en DESC LIMIT 1`, tid, id).Scan(&correo)
	m.app.DB.QueryRowContext(ctx, `SELECT nota FROM notas_clientes WHERE tienda_id=$1 AND cliente=$2`, tid, id).Scan(&nota)

	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, p.entrega, p.estado, p.total_centimos, p.creado_en,
		(SELECT i.nombre FROM pedido_items i WHERE i.pedido_id=p.id LIMIT 1), (SELECT i.imagen_key FROM pedido_items i WHERE i.pedido_id=p.id LIMIT 1),
		(SELECT count(*) FROM pedido_items i WHERE i.pedido_id=p.id)
		FROM pedidos p WHERE p.tienda_id=$1 AND md5(p.comprador_celular)=$2 ORDER BY p.creado_en DESC LIMIT 50`, tid, id)
	if err != nil {
		return err
	}
	type compra struct {
		ID          string    `json:"id"`
		Codigo      string    `json:"codigo"`
		Entrega     string    `json:"entrega"`
		Estado      string    `json:"estado"`
		EstadoTexto string    `json:"estado_texto"`
		Total       int       `json:"total_centimos"`
		Fecha       time.Time `json:"creado_en"`
		Producto    string    `json:"producto"`
		ImagenURL   string    `json:"imagen_url"`
		Items       int       `json:"items"`
	}
	compras := []compra{}
	for rows.Next() {
		var x compra
		var prod, img *string
		rows.Scan(&x.ID, &x.Codigo, &x.Entrega, &x.Estado, &x.Total, &x.Fecha, &prod, &img, &x.Items)
		if prod != nil {
			x.Producto = *prod
		}
		if img != nil {
			x.ImagenURL = m.app.Archivos.URLPublica(*img)
		}
		x.EstadoTexto = TextoEstado(x.Estado, x.Entrega)
		compras = append(compras, x)
	}
	rows.Close()

	ayudas := []Ayuda{}
	for _, cp := range compras {
		if l, err := m.leerAyudas(ctx, tid, cp.ID); err == nil {
			ayudas = append(ayudas, l...)
		}
	}
	httpx.OK(w, map[string]any{"cliente": c, "correo": correo, "nota": nota, "compras": compras, "ayudas": ayudas})
	return nil
}

func (m *Modulo) guardarNota(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Nota string `json:"nota"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Nota = strings.TrimSpace(in.Nota)
	if len([]rune(in.Nota)) > 500 {
		return httpx.Invalido("La nota puede tener hasta 500 caracteres.")
	}
	id := chi.URLParam(r, "id")
	var existe bool
	m.app.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pedidos WHERE tienda_id=$1 AND md5(comprador_celular)=$2)`, tid, id).Scan(&existe)
	if !existe {
		return httpx.ErrNoEncontrado
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO notas_clientes (tienda_id, cliente, nota) VALUES ($1,$2,$3)
		ON CONFLICT (tienda_id, cliente) DO UPDATE SET nota=$3, actualizado_en=now()`, tid, id, in.Nota); err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"nota": in.Nota})
	return nil
}
