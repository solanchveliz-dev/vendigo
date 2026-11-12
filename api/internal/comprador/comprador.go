// Package comprador es la cuenta opcional del comprador: ver todas sus compras en un solo lugar.
// Comprar sigue sin exigir cuenta; al crearla (o al entrar), sus pedidos anteriores hechos con el mismo
// celular verificado quedan unidos a la cuenta.
package comprador

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

type Modulo struct{ app *core.App }

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

// Rutas se montan en /comprador (con sesión).
func (m *Modulo) Rutas(r chi.Router) {
	r.Method("GET", "/resumen", httpx.Handler(m.resumen))
	r.Method("GET", "/pedidos", httpx.Handler(m.pedidos))
	m.rutasFase2(r)
}

// Pedido es una compra vista por quien la hizo.
type Pedido struct {
	Codigo      string    `json:"codigo"`
	Token       string    `json:"token"` // para abrir el seguimiento
	Tienda      string    `json:"tienda"`
	TiendaSlug  string    `json:"tienda_slug"`
	TiendaLogo  string    `json:"tienda_logo"`
	Estado      string    `json:"estado"`
	EstadoTexto string    `json:"estado_texto"`
	PagoEstado  string    `json:"pago_estado"`
	PagoTexto   string    `json:"pago_texto"`
	Entrega     string    `json:"entrega"`
	Total       int       `json:"total_centimos"`
	Items       int       `json:"items"`
	Producto    string    `json:"producto"`
	ImagenURL   string    `json:"imagen_url"`
	CreadoEn    time.Time `json:"creado_en"`
	Grupo       string    `json:"grupo"` // curso, entregado o cancelado
	Valorado    bool      `json:"valorado"`
}

// Unir junta a la cuenta los pedidos hechos con su celular verificado antes de tenerla.
// Así siguen apareciendo aunque después cambie de número.
func Unir(ctx context.Context, q core.Ejecutor, usuarioID string) error {
	_, err := q.ExecContext(ctx, `UPDATE pedidos p SET comprador_id=u.id FROM usuarios u
		WHERE u.id=$1 AND u.celular_verificado AND p.comprador_id IS NULL AND p.comprador_celular=u.celular`, usuarioID)
	return err
}

func grupo(estado string) string {
	switch estado {
	case "entregado":
		return "entregado"
	case "rechazado", "cancelado":
		return "cancelado"
	}
	return "curso"
}

func (m *Modulo) listar(ctx context.Context, uid string, soloCurso bool, limite int) ([]Pedido, error) {
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.codigo, COALESCE(p.token_seguimiento,''), t.nombre, t.slug, COALESCE(t.logo_key,''),
		p.estado, COALESCE((SELECT g.estado FROM pagos g WHERE g.pedido_id=p.id),'pendiente'), p.entrega, p.total_centimos,
		(SELECT COALESCE(SUM(cantidad),0) FROM pedido_items i WHERE i.pedido_id=p.id),
		COALESCE((SELECT i.nombre FROM pedido_items i WHERE i.pedido_id=p.id LIMIT 1),''),
		COALESCE((SELECT i.imagen_key FROM pedido_items i WHERE i.pedido_id=p.id LIMIT 1),''), p.creado_en,
		EXISTS(SELECT 1 FROM valoraciones v WHERE v.pedido_id=p.id)
		FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id
		WHERE p.comprador_id=$1 AND (NOT $2 OR p.estado NOT IN ('entregado','rechazado','cancelado'))
		ORDER BY p.creado_en DESC LIMIT $3`, uid, soloCurso, limite)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Pedido{}
	for rows.Next() {
		var p Pedido
		var logo, img string
		if err := rows.Scan(&p.Codigo, &p.Token, &p.Tienda, &p.TiendaSlug, &logo, &p.Estado, &p.PagoEstado, &p.Entrega, &p.Total,
			&p.Items, &p.Producto, &img, &p.CreadoEn, &p.Valorado); err != nil {
			return nil, err
		}
		if logo != "" {
			p.TiendaLogo = m.app.Archivos.URLPublica(logo)
		}
		if img != "" {
			p.ImagenURL = m.app.Archivos.URLPublica(img)
		}
		p.EstadoTexto = pedidos.TextoEstado(p.Estado, p.Entrega)
		p.PagoTexto = pagos.Textos[p.PagoEstado]
		p.Grupo = grupo(p.Estado)
		out = append(out, p)
	}
	return out, rows.Err()
}

func (m *Modulo) pedidos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	if err := Unir(ctx, m.app.DB, u.ID); err != nil {
		return err
	}
	lista, err := m.listar(ctx, u.ID, false, 300)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"pedidos": lista})
	return nil
}

// resumen alimenta "Mi inicio" y la cabecera de "Mi perfil".
func (m *Modulo) resumen(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	if err := Unir(ctx, m.app.DB, u.ID); err != nil {
		return err
	}
	var d struct {
		Nombre  string    `json:"nombre"`
		Desde   time.Time `json:"desde"`
		Total   int       `json:"pedidos"`
		EnCurso int       `json:"en_curso"`
		Curso   []Pedido  `json:"pedidos_en_curso"`
		// Fase 2: avisos sin leer, tiendas que sigue y pedidos entregados sin valorar.
		NoLeidas   int         `json:"no_leidas"`
		PorValorar int         `json:"por_valorar"`
		Seguidas   []TiendaFav `json:"tiendas_seguidas"`
	}
	err := m.app.DB.QueryRowContext(ctx, `SELECT u.nombre, u.creado_en,
		(SELECT count(*) FROM pedidos WHERE comprador_id=u.id),
		(SELECT count(*) FROM pedidos WHERE comprador_id=u.id AND estado NOT IN ('entregado','rechazado','cancelado')),
		(SELECT count(*) FROM notificaciones WHERE usuario_id=u.id AND NOT leida),
		(SELECT count(*) FROM pedidos p WHERE p.comprador_id=u.id AND p.estado='entregado' AND NOT EXISTS(SELECT 1 FROM valoraciones v WHERE v.pedido_id=p.id))
		FROM usuarios u WHERE u.id=$1`, u.ID).Scan(&d.Nombre, &d.Desde, &d.Total, &d.EnCurso, &d.NoLeidas, &d.PorValorar)
	if err == sql.ErrNoRows {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	if d.Curso, err = m.listar(ctx, u.ID, true, 3); err != nil {
		return err
	}
	if d.Seguidas, err = m.tiendasSeguidas(r, 3); err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}
