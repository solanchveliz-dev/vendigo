package pedidos

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// "Ayuda con mi pedido": sin chat. El cliente escribe dentro de su pedido y la tienda responde ahí.

var MotivosAyuda = []string{"¿Cuándo llega mi pedido?", "Cambiar la dirección o el día", "Tengo una duda sobre el producto"}

type MensajeAyuda struct {
	Autor    string    `json:"autor"`
	Texto    string    `json:"texto"`
	CreadoEn time.Time `json:"creado_en"`
}

type Ayuda struct {
	ID        string         `json:"id"`
	PedidoID  string         `json:"pedido_id"`
	Codigo    string         `json:"codigo"`
	Comprador string         `json:"comprador"`
	Motivo    string         `json:"motivo"`
	Abierta   bool           `json:"abierta"`
	Mensajes  []MensajeAyuda `json:"mensajes"`
	CreadoEn  time.Time      `json:"creado_en"`
}

// AbrirAyuda la usa el comprador (y la demo). Si ya había una, agrega el mensaje y la reabre.
func AbrirAyuda(ctx context.Context, tx *sql.Tx, pedidoID, motivo, texto string) error {
	texto = strings.TrimSpace(texto)
	if n := len([]rune(texto)); n < 3 || n > 300 {
		return httpx.Invalido("Escribe tu mensaje (máximo 300 caracteres).")
	}
	var tid, codigo string
	if err := tx.QueryRowContext(ctx, `SELECT tienda_id, codigo FROM pedidos WHERE id::text=$1`, pedidoID).Scan(&tid, &codigo); err != nil {
		if core.SinFilas(err) {
			return httpx.ErrNoEncontrado
		}
		return err
	}
	var aid string
	if err := tx.QueryRowContext(ctx, `INSERT INTO ayudas_pedido (pedido_id, motivo) VALUES ($1,$2)
		ON CONFLICT (pedido_id) DO UPDATE SET motivo=$2, abierta=true RETURNING id`, pedidoID, motivo).Scan(&aid); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO ayuda_mensajes (ayuda_id, autor, texto) VALUES ($1,'cliente',$2)`, aid, texto); err != nil {
		return err
	}
	billetera.Notificar(ctx, tx, tid, "Piden ayuda con "+codigo, motivo+": “"+texto+"”", "/vendedor/consultas?tab=ayuda")
	return nil
}

func (m *Modulo) leerAyudas(ctx context.Context, tid, pedidoID string) ([]Ayuda, error) {
	cond, args := "p.tienda_id=$1", []any{tid}
	if pedidoID != "" {
		cond, args = "p.tienda_id=$1 AND p.id=$2", append(args, pedidoID)
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT a.id, p.id, p.codigo, p.comprador_nombre, a.motivo, a.abierta, a.creado_en
		FROM ayudas_pedido a JOIN pedidos p ON p.id=a.pedido_id WHERE `+cond+` ORDER BY a.abierta DESC, a.creado_en DESC LIMIT 100`, args...)
	if err != nil {
		return nil, err
	}
	out := []Ayuda{}
	for rows.Next() {
		var a Ayuda
		rows.Scan(&a.ID, &a.PedidoID, &a.Codigo, &a.Comprador, &a.Motivo, &a.Abierta, &a.CreadoEn)
		a.Mensajes = []MensajeAyuda{}
		out = append(out, a)
	}
	rows.Close()
	for i := range out {
		ms, err := m.app.DB.QueryContext(ctx, `SELECT autor, texto, creado_en FROM ayuda_mensajes WHERE ayuda_id=$1 ORDER BY creado_en`, out[i].ID)
		if err != nil {
			return nil, err
		}
		for ms.Next() {
			var x MensajeAyuda
			ms.Scan(&x.Autor, &x.Texto, &x.CreadoEn)
			out[i].Mensajes = append(out[i].Mensajes, x)
		}
		ms.Close()
	}
	return out, nil
}

func (m *Modulo) ayudas(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	l, err := m.leerAyudas(ctx, tid, "")
	if err != nil {
		return err
	}
	abiertas := 0
	for _, a := range l {
		if a.Abierta {
			abiertas++
		}
	}
	httpx.OK(w, map[string]any{"ayudas": l, "abiertas": abiertas})
	return nil
}

func (m *Modulo) responderAyuda(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
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
	if n := len([]rune(in.Texto)); n < 2 || n > 300 {
		return httpx.Invalido("La respuesta debe tener entre 2 y 300 caracteres.")
	}
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var aid, pid string
		err := tx.QueryRowContext(ctx, `UPDATE ayudas_pedido a SET abierta=false FROM pedidos p
			WHERE a.id::text=$1 AND p.id=a.pedido_id AND p.tienda_id=$2 RETURNING a.id, p.id`, chi.URLParam(r, "id"), tid).Scan(&aid, &pid)
		if core.SinFilas(err) {
			return httpx.ErrNoEncontrado
		}
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO ayuda_mensajes (ayuda_id, autor, texto) VALUES ($1,'tienda',$2)`, aid, in.Texto); err != nil {
			return err
		}
		return evento(ctx, tx, pid, "ayuda", fmt.Sprintf("La tienda respondió: “%s”", in.Texto))
	})
	if err != nil {
		return err
	}
	return m.ayudas(w, r)
}
