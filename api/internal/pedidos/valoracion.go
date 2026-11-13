package pedidos

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// DiasParaValorar: plazo para calificar un pedido desde que se entregó.
const DiasParaValorar = 30

// Valoracion: la calificación que dejó el cliente, para mostrarla en el pedido (a él y a la tienda).
type Valoracion struct {
	Estrellas  int       `json:"estrellas"`
	Comentario string    `json:"comentario"`
	FotoURLs   []string  `json:"foto_urls"`
	CreadoEn   time.Time `json:"creado_en"`
}

// NuevaValoracion: lo que envía el cliente al calificar.
type NuevaValoracion struct {
	Tienda     int            `json:"tienda"`     // estrellas para la tienda (1 a 5), obligatorio
	Productos  map[string]int `json:"productos"`  // estrellas por producto (opcional)
	Comentario string         `json:"comentario"` // opcional, hasta 500 caracteres
	Fotos      []string       `json:"fotos"`      // keys subidas al bucket privado (opcional, hasta 3)
}

// GuardarValoracion: una sola regla para calificar, se use desde "Mi cuenta" o desde el enlace de seguimiento.
// Solo pedidos entregados, una vez por pedido y dentro de los 30 días. Avisa a la tienda.
func GuardarValoracion(ctx context.Context, tx *sql.Tx, pid string, usuarioID *string, in NuevaValoracion) error {
	in.Comentario = strings.TrimSpace(in.Comentario)
	switch {
	case in.Tienda < 1 || in.Tienda > 5:
		return httpx.Invalido("Elige de 1 a 5 estrellas para la tienda.")
	case len([]rune(in.Comentario)) > 500:
		return httpx.Invalido("El comentario puede tener hasta 500 caracteres.")
	case len(in.Fotos) > 3:
		return httpx.Invalido("Puedes subir hasta 3 fotos.")
	}
	for _, k := range in.Fotos {
		if !strings.HasPrefix(k, "valoracion/"+pid+"/") {
			return httpx.Invalido("Una de las fotos no corresponde a este pedido.")
		}
	}
	var tid, estado string
	var entregado *time.Time
	var valorado bool
	err := tx.QueryRowContext(ctx, `SELECT tienda_id, estado, entregado_en, EXISTS(SELECT 1 FROM valoraciones v WHERE v.pedido_id=p.id)
		FROM pedidos p WHERE id=$1 FOR UPDATE`, pid).Scan(&tid, &estado, &entregado, &valorado)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	if estado != "entregado" {
		return httpx.Invalido("Podrás calificar tu pedido cuando lo recibas.")
	}
	if valorado {
		return httpx.Conflicto("ya_valorado", "Ya calificaste este pedido. ¡Gracias!")
	}
	if entregado != nil && time.Since(*entregado) > DiasParaValorar*24*time.Hour {
		return httpx.Invalido("El plazo para calificar este pedido ya terminó.")
	}
	var vid string
	if err := tx.QueryRowContext(ctx, `INSERT INTO valoraciones (pedido_id, usuario_id, tienda_id, estrellas_tienda, comentario, foto_keys)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, pid, usuarioID, tid, in.Tienda, in.Comentario, pq.Array(in.Fotos)).Scan(&vid); err != nil {
		return err
	}
	for prod, n := range in.Productos {
		if n < 1 || n > 5 {
			return httpx.Invalido("Elige de 1 a 5 estrellas para cada producto.")
		}
		// Solo productos que estaban en el pedido.
		if _, err := tx.ExecContext(ctx, `INSERT INTO valoraciones_productos (valoracion_id, producto_id, estrellas)
			SELECT $1, producto_id, $3 FROM pedido_items WHERE pedido_id=$4 AND producto_id::text=$2 LIMIT 1 ON CONFLICT DO NOTHING`,
			vid, prod, n, pid); err != nil {
			return err
		}
	}
	cuerpo := in.Comentario
	if r := []rune(cuerpo); len(r) > 120 {
		cuerpo = string(r[:120]) + "…"
	}
	if cuerpo == "" {
		cuerpo = "Un cliente calificó su pedido."
	}
	if len(in.Fotos) > 0 {
		cuerpo += " (con fotos)"
	}
	billetera.Notificar(ctx, tx, tid, "Nueva calificación: "+strings.Repeat("★", in.Tienda), cuerpo, "/vendedor/pedidos/"+pid)
	return nil
}

// cargarValoracion: la calificación del pedido, si ya la tiene (con las fotos firmadas por un rato).
func (m *Modulo) cargarValoracion(ctx context.Context, pid string) *Valoracion {
	var v Valoracion
	var keys []string
	err := m.app.DB.QueryRowContext(ctx, `SELECT estrellas_tienda, comentario, foto_keys, creado_en FROM valoraciones WHERE pedido_id=$1`, pid).
		Scan(&v.Estrellas, &v.Comentario, pq.Array(&keys), &v.CreadoEn)
	if err != nil {
		return nil
	}
	v.FotoURLs = m.firmar(ctx, keys)
	return &v
}
