package planes

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// Impulsar un producto es un pago extra de la tienda a VendiGo (como impulsar una publicación en Marketplace):
// mientras dura, el producto sale primero cuando alguien busca algo relacionado en VendiGo, en "Destacados"
// y en su tienda, con la etiqueta "Destacado". Se paga con Yape a VendiGo desde la app y se activa cuando
// el equipo confirma el pago. Lo cobrado alimenta el fondo de emergencia de VendiGo.

// DiasImpulso son los paquetes que puede elegir la tienda.
var DiasImpulso = []int{3, 7, 15}

// PrecioDestacado lee el precio de 7 días y los días por defecto desde los ajustes de la plataforma.
func PrecioDestacado(ctx context.Context, q core.Ejecutor) (precio, dias int) {
	precio, dias = 500, 7
	q.QueryRowContext(ctx, `SELECT COALESCE((SELECT valor::int FROM ajustes_plataforma WHERE clave='destacado_precio_centimos'), 500),
		COALESCE((SELECT valor::int FROM ajustes_plataforma WHERE clave='destacado_dias'), 7)`).Scan(&precio, &dias)
	return
}

// precioImpulso: proporcional al precio base, redondeado a 50 céntimos (mínimo S/ 1).
func precioImpulso(base, diasBase, dias int) int {
	if diasBase <= 0 {
		diasBase = 7
	}
	p := (base*dias + diasBase/2) / diasBase
	p = (p + 25) / 50 * 50
	return max(p, 100)
}

type paquete struct {
	Dias   int `json:"dias"`
	Precio int `json:"precio_centimos"`
}

func paquetes(ctx context.Context, q core.Ejecutor) []paquete {
	base, diasBase := PrecioDestacado(ctx, q)
	out := []paquete{}
	for _, d := range DiasImpulso {
		out = append(out, paquete{d, precioImpulso(base, diasBase, d)})
	}
	return out
}

// GET /vendedor/destacados: paquetes, datos para yapear a VendiGo e impulsos (activos, pendientes y pasados) con sus números.
func (m *Modulo) destacados(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	type item struct {
		ProductoID  string     `json:"producto_id"`
		Nombre      string     `json:"nombre"`
		Imagen      string     `json:"imagen_url"`
		Estado      string     `json:"estado"` // activo, pendiente, terminado
		Dias        int        `json:"dias"`
		Inicio      *time.Time `json:"inicio"`
		Fin         *time.Time `json:"fin"`
		Impresiones int        `json:"impresiones"`
		Visitas     int        `json:"visitas"`
		Monto       int        `json:"monto_centimos"`
	}
	lista := []item{}
	// Pendientes de confirmar por VendiGo.
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.nombre, (SELECT key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY orden LIMIT 1), pp.dias, pp.monto_centimos
		FROM pagos_plan pp JOIN productos p ON p.id=pp.producto_id WHERE pp.tienda_id=$1 AND pp.tipo='destacado' AND pp.estado='pendiente'`, tid)
	if err != nil {
		return err
	}
	for rows.Next() {
		it := item{Estado: "pendiente"}
		var key sql.NullString
		if err := rows.Scan(&it.ProductoID, &it.Nombre, &key, &it.Dias, &it.Monto); err != nil {
			rows.Close()
			return err
		}
		if key.Valid {
			it.Imagen = m.app.Archivos.URLPublica(key.String)
		}
		lista = append(lista, it)
	}
	rows.Close()
	// Impulsos ya activados (los últimos 20).
	rows, err = m.app.DB.QueryContext(ctx, `SELECT p.id, p.nombre, (SELECT key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY orden LIMIT 1),
		i.dias, i.inicio, i.fin, i.impresiones, i.visitas, COALESCE(pp.monto_centimos, 0)
		FROM impulsos i JOIN productos p ON p.id=i.producto_id LEFT JOIN pagos_plan pp ON pp.id=i.pago_plan_id
		WHERE i.tienda_id=$1 ORDER BY i.fin DESC LIMIT 20`, tid)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var it item
		var key sql.NullString
		if err := rows.Scan(&it.ProductoID, &it.Nombre, &key, &it.Dias, &it.Inicio, &it.Fin, &it.Impresiones, &it.Visitas, &it.Monto); err != nil {
			return err
		}
		if key.Valid {
			it.Imagen = m.app.Archivos.URLPublica(key.String)
		}
		it.Estado = "terminado"
		if it.Fin.After(time.Now()) {
			it.Estado = "activo"
		}
		lista = append(lista, it)
	}
	httpx.OK(w, map[string]any{"paquetes": paquetes(ctx, m.app.DB), "impulsos": lista, "pago_vendigo": m.cobro(ctx)})
	return nil
}

// POST /vendedor/productos/{id}/destacar {dias, referencia}: la tienda ya yapeó a VendiGo desde su celular
// y registra el n.° de operación en la app. Queda pendiente hasta que VendiGo lo confirme.
func (m *Modulo) destacar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Dias       int    `json:"dias"`
		Metodo     string `json:"metodo"`
		Referencia string `json:"referencia"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Referencia = strings.TrimSpace(in.Referencia)
	if !slices.Contains(DiasImpulso, in.Dias) {
		return httpx.Invalido("Elige cuántos días quieres impulsar tu producto: 3, 7 o 15.")
	}
	if in.Metodo == "" {
		in.Metodo = "yape"
	}
	// Con Culqi se paga justo después (POST /plan/pagos/{id}/culqi) y no hace falta n.° de operación.
	if in.Metodo == "culqi" {
		if !slices.Contains(m.cobro(ctx).Metodos, "culqi") {
			return httpx.Invalido("El pago con Culqi todavía no está disponible.")
		}
		in.Referencia = ""
	} else {
		if err := metodoValido(ctx, m.app.DB, in.Metodo); err != nil {
			return err
		}
		if len(in.Referencia) < 4 || len(in.Referencia) > 40 {
			return httpx.Invalido("Escribe el número de operación de tu pago a VendiGo.")
		}
	}
	base, diasBase := PrecioDestacado(ctx, m.app.DB)
	precio := precioImpulso(base, diasBase, in.Dias)
	pid := chi.URLParam(r, "id")
	var pagoID string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var nombre string
		var activo bool
		var stock int
		err := tx.QueryRowContext(ctx, `SELECT nombre, activo, stock FROM productos WHERE id::text=$1 AND tienda_id=$2 AND NOT eliminado`, pid, tid).Scan(&nombre, &activo, &stock)
		if core.SinFilas(err) {
			return httpx.ErrNoEncontrado
		}
		if err != nil {
			return err
		}
		if !activo || stock <= 0 {
			return httpx.Invalido("Solo puedes impulsar productos publicados y con stock.")
		}
		// Un intento con Culqi que no llegó a cobrarse no bloquea un nuevo intento.
		tx.ExecContext(ctx, `DELETE FROM pagos_plan WHERE producto_id::text=$1 AND tipo='destacado' AND estado='pendiente' AND metodo='culqi' AND referencia_tienda=''`, pid)
		var pendiente bool
		tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM pagos_plan WHERE producto_id::text=$1 AND tipo='destacado' AND estado='pendiente')`, pid).Scan(&pendiente)
		if pendiente {
			return httpx.Conflicto("pago_pendiente", "Este producto ya tiene un impulso por confirmar.")
		}
		return tx.QueryRowContext(ctx, `INSERT INTO pagos_plan (tienda_id, concepto, monto_centimos, metodo, estado, tipo, producto_id, dias, referencia_tienda)
			VALUES ($1,$2,$3,$7,'pendiente','destacado',$4,$5,$6) RETURNING id`, tid, fmt.Sprintf("Impulsar «%s» %d días", nombre, in.Dias), precio, pid, in.Dias, in.Referencia, in.Metodo).Scan(&pagoID)
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": pagoID, "mensaje": "¡Listo! Recibimos tu pedido. Tu producto empieza a destacar cuando VendiGo confirme tu pago (te avisamos)."})
	return nil
}

// AplicarDestacado activa (o extiende) el impulso cuando VendiGo confirma el pago y abre su registro de números.
func AplicarDestacado(ctx context.Context, tx *sql.Tx, productoID, tiendaID, pagoID string, dias int) error {
	if dias <= 0 {
		dias = 7
	}
	var fin time.Time
	if err := tx.QueryRowContext(ctx, `UPDATE productos SET destacado_hasta = GREATEST(COALESCE(destacado_hasta, now()), now()) + make_interval(days => $2)
		WHERE id::text=$1 RETURNING destacado_hasta`, productoID, dias).Scan(&fin); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO impulsos (producto_id, tienda_id, pago_plan_id, dias, inicio, fin)
		VALUES ($1, $2, $3, $4, GREATEST(now(), $5::timestamptz - make_interval(days => $4)), $5)`, productoID, tiendaID, pagoID, dias, fin)
	return err
}
