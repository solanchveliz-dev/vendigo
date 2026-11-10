package admin

import (
	"database/sql"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Planes (precios y límites que el sistema sí aplica) y reportes por mes.

type PlanAdmin struct {
	ID           string `json:"id"`
	Nombre       string `json:"nombre"`
	Precio       int    `json:"precio_centimos"`
	VentasMes    *int   `json:"ventas_mes"`
	CreditosIA   int    `json:"creditos_ia"`
	ProductosMax *int   `json:"productos_max"`
	Disponible   bool   `json:"disponible"`
	Tiendas      int    `json:"tiendas"`
}

func (m *Modulo) planes(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT p.id, p.nombre, p.precio_centimos, p.ventas_mes, p.creditos_ia, p.productos_max, p.disponible,
		CASE WHEN p.id='gratis' THEN (SELECT count(*) FROM tiendas t WHERE NOT EXISTS (SELECT 1 FROM suscripciones s WHERE s.tienda_id=t.id AND s.activa AND s.plan_id<>'gratis'))
		ELSE (SELECT count(*) FROM suscripciones s WHERE s.plan_id=p.id AND s.activa) END
		FROM planes p ORDER BY p.orden`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []PlanAdmin{}
	for rows.Next() {
		var p PlanAdmin
		if err := rows.Scan(&p.ID, &p.Nombre, &p.Precio, &p.VentasMes, &p.CreditosIA, &p.ProductosMax, &p.Disponible, &p.Tiendas); err != nil {
			return err
		}
		out = append(out, p)
	}
	httpx.OK(w, map[string]any{"planes": out})
	return nil
}

func (m *Modulo) guardarPlan(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	var in struct {
		Precio       int  `json:"precio_centimos"`
		VentasMes    *int `json:"ventas_mes"`
		CreditosIA   int  `json:"creditos_ia"`
		ProductosMax *int `json:"productos_max"`
		Disponible   bool `json:"disponible"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	switch {
	case id == "gratis" && in.Precio != 0:
		return httpx.Invalido("El plan Gratis no puede tener precio.")
	case id == "gratis" && !in.Disponible:
		return httpx.Invalido("El plan Gratis siempre debe estar disponible: es el plan con el que empieza cada tienda.")
	case id != "gratis" && (in.Precio < 100 || in.Precio > 100000):
		return httpx.Invalido("El precio debe estar entre S/ 1 y S/ 1,000.")
	case in.CreditosIA < 0 || in.CreditosIA > 100000:
		return httpx.Invalido("Los usos de IA deben estar entre 0 y 100,000.")
	case in.VentasMes != nil && (*in.VentasMes < 1 || *in.VentasMes > 1000000):
		return httpx.Invalido("Las ventas al mes deben ser al menos 1 (o déjalo vacío para ilimitadas).")
	case in.ProductosMax != nil && (*in.ProductosMax < 1 || *in.ProductosMax > 100000):
		return httpx.Invalido("Los productos deben ser al menos 1 (o déjalo vacío para ilimitados).")
	}
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var nombre string
		var antes int
		err := tx.QueryRowContext(ctx, `SELECT nombre, precio_centimos FROM planes WHERE id=$1 FOR UPDATE`, id).Scan(&nombre, &antes)
		if core.SinFilas(err) {
			return httpx.ErrNoEncontrado
		}
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE planes SET precio_centimos=$2, ventas_mes=$3, creditos_ia=$4, productos_max=$5, disponible=$6 WHERE id=$1`,
			id, in.Precio, in.VentasMes, in.CreditosIA, in.ProductosMax, in.Disponible); err != nil {
			return err
		}
		if in.Precio != antes {
			// Se avisa a las tiendas del plan: el nuevo precio rige desde su siguiente cobro.
			cuerpo := fmt.Sprintf("El plan %s pasa de S/ %.2f a S/ %.2f al mes. Se aplica desde tu siguiente cobro; tu periodo actual no cambia.", nombre, float64(antes)/100, float64(in.Precio)/100)
			if _, err := tx.ExecContext(ctx, `INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo)
				SELECT t.usuario_id, 'Cambio de precio de tu plan', $2, '/vendedor/plan', 'pagos'
				FROM suscripciones s JOIN tiendas t ON t.id=s.tienda_id WHERE s.plan_id=$1 AND s.activa`, id, cuerpo); err != nil {
				return err
			}
		}
		m.app.Auditar(ctx, tx, adminID(ctx), "editar_plan", "plan", id, map[string]any{"precio_antes": antes, "precio": in.Precio, "creditos_ia": in.CreditosIA, "disponible": in.Disponible})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Plan guardado."})
	return nil
}

// mesPedido lee ?mes=AAAA-MM (por defecto el mes actual en Lima).
func mesPedido(r *http.Request) (time.Time, time.Time, error) {
	lima, _ := time.LoadLocation("America/Lima")
	ini := time.Now().In(lima)
	ini = time.Date(ini.Year(), ini.Month(), 1, 0, 0, 0, 0, lima)
	if v := r.URL.Query().Get("mes"); v != "" {
		t, err := time.ParseInLocation("2006-01", v, lima)
		if err != nil {
			return ini, ini, httpx.Invalido("Mes no válido.")
		}
		ini = t
	}
	return ini, ini.AddDate(0, 1, 0), nil
}

func (m *Modulo) reportes(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	ini, fin, err := mesPedido(r)
	if err != nil {
		return err
	}
	var out struct {
		Semanas   []int          `json:"usuarios_semana"`
		Pedidos   map[string]int `json:"pedidos"`
		Reclamos  map[string]int `json:"reclamos"`
		Consultas struct {
			Preguntas     int     `json:"preguntas"`
			RespuestaMin  float64 `json:"respuesta_min"`
			Automaticas   float64 `json:"automaticas_pct"`
			MensajesAyuda int     `json:"mensajes_ayuda"`
			CreditosIA    int     `json:"creditos_ia"`
		} `json:"consultas"`
	}
	// Nuevos usuarios por semana del mes (1-7, 8-14, 15-21, 22-28, 29-fin).
	out.Semanas = make([]int, 5)
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT LEAST(((EXTRACT(day FROM creado_en AT TIME ZONE 'America/Lima')::int-1)/7),4), count(*)
		FROM usuarios WHERE creado_en >= $1 AND creado_en < $2 GROUP BY 1`, ini, fin); err == nil {
		for rows.Next() {
			var s, n int
			rows.Scan(&s, &n)
			out.Semanas[s] = n
		}
		rows.Close()
	}
	if ini.AddDate(0, 0, 28).Equal(fin) {
		out.Semanas = out.Semanas[:4] // febrero de 28 días
	}
	var ent, cur, can int
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FILTER (WHERE estado='entregado'), count(*) FILTER (WHERE estado IN ('por_aceptar','preparando','listo_recojo','enviado')),
		count(*) FILTER (WHERE estado IN ('rechazado','cancelado')) FROM pedidos WHERE creado_en >= $1 AND creado_en < $2`, ini, fin).
		Scan(&ent, &cur, &can)
	out.Pedidos = map[string]int{"entregados": ent, "en_curso": cur, "cancelados": can}
	out.Reclamos = map[string]int{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT motivo, count(*) FROM reclamos WHERE creado_en >= $1 AND creado_en < $2 GROUP BY 1`, ini, fin); err == nil {
		for rows.Next() {
			var k string
			var n int
			rows.Scan(&k, &n)
			out.Reclamos[k] = n
		}
		rows.Close()
	}
	c := &out.Consultas
	m.app.DB.QueryRowContext(ctx, `SELECT count(*),
		COALESCE(AVG(EXTRACT(epoch FROM respondida_en-creado_en)/60) FILTER (WHERE respondida_en IS NOT NULL AND NOT automatica),0),
		COALESCE(100.0*count(*) FILTER (WHERE automatica)/NULLIF(count(*) FILTER (WHERE respondida_en IS NOT NULL),0),0)
		FROM preguntas WHERE creado_en >= $1 AND creado_en < $2`, ini, fin).Scan(&c.Preguntas, &c.RespuestaMin, &c.Automaticas)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM ayuda_mensajes WHERE creado_en >= $1 AND creado_en < $2`, ini, fin).Scan(&c.MensajesAyuda)
	m.app.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(creditos),0) FROM uso_ia WHERE creado_en >= $1 AND creado_en < $2`, ini, fin).Scan(&c.CreditosIA)
	httpx.OK(w, out)
	return nil
}

// reporteCSV devuelve las filas de un área para el mes elegido (la web arma el archivo).
func (m *Modulo) reporteCSV(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	ini, fin, err := mesPedido(r)
	if err != nil {
		return err
	}
	consultas := map[string]struct {
		cab []string
		sql string
	}{
		"usuarios": {[]string{"Nombre", "Celular", "Correo", "Rol", "Activo", "Registro"},
			`SELECT nombre, COALESCE(celular,''), COALESCE(email,''), initcap(rol), CASE WHEN activo THEN 'Sí' ELSE 'No' END, to_char(creado_en AT TIME ZONE 'America/Lima','DD/MM/YYYY HH24:MI') FROM usuarios WHERE creado_en >= $1 AND creado_en < $2 ORDER BY creado_en`},
		"vendedores": {[]string{"Tienda", "Dueña", "Plan", "Reputación", "Pedidos del mes", "Ventas del mes (S/)"},
			`SELECT t.nombre, u.nombre, COALESCE((SELECT s.plan_id FROM suscripciones s WHERE s.tienda_id=t.id AND s.activa),'gratis'), t.reputacion,
				(SELECT count(*) FROM pedidos p WHERE p.tienda_id=t.id AND p.creado_en >= $1 AND p.creado_en < $2 AND p.estado NOT IN ('rechazado','cancelado')),
				to_char(COALESCE((SELECT SUM(p.total_centimos) FROM pedidos p WHERE p.tienda_id=t.id AND p.creado_en >= $1 AND p.creado_en < $2 AND p.estado NOT IN ('rechazado','cancelado')),0)/100.0,'FM999999990.00')
				FROM tiendas t JOIN usuarios u ON u.id=t.usuario_id ORDER BY t.nombre`},
		"productos": {[]string{"Producto", "Tienda", "Precio (S/)", "Stock", "Estado", "Vendidos del mes"},
			`SELECT p.nombre, t.nombre, to_char(p.precio_centimos/100.0,'FM999999990.00'), p.stock,
				CASE WHEN p.retirado_motivo<>'' THEN 'Retirado' WHEN NOT p.activo THEN 'Pausado' WHEN p.stock=0 THEN 'Agotado' ELSE 'Publicado' END,
				COALESCE((SELECT SUM(i.cantidad) FROM pedido_items i JOIN pedidos pe ON pe.id=i.pedido_id WHERE i.producto_id=p.id AND pe.creado_en >= $1 AND pe.creado_en < $2 AND pe.estado NOT IN ('rechazado','cancelado')),0)
				FROM productos p JOIN tiendas t ON t.id=p.tienda_id WHERE NOT p.eliminado ORDER BY t.nombre, p.nombre`},
		"pedidos": {[]string{"Pedido", "Fecha", "Tienda", "Comprador", "Entrega", "Estado", "Total (S/)"},
			`SELECT p.codigo, to_char(p.creado_en AT TIME ZONE 'America/Lima','DD/MM/YYYY HH24:MI'), t.nombre, p.comprador_nombre, initcap(p.entrega), initcap(replace(p.estado,'_',' ')), to_char(p.total_centimos/100.0,'FM999999990.00')
				FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id WHERE p.creado_en >= $1 AND p.creado_en < $2 ORDER BY p.creado_en`},
		"pagos": {[]string{"Pedido", "Fecha", "Tienda", "Método", "Cuándo paga", "Estado del pago", "Origen", "Monto (S/)", "N.° de operación"},
			`SELECT p.codigo, to_char(p.creado_en AT TIME ZONE 'America/Lima','DD/MM/YYYY HH24:MI'), t.nombre, initcap(replace(g.metodo,'_',' ')),
				CASE g.momento WHEN 'antes' THEN 'Antes del envío' ELSE 'Al recibir' END, initcap(replace(g.estado,'_',' ')),
				CASE g.origen WHEN 'tienda' THEN 'Informado por la tienda' WHEN 'proveedor' THEN 'Proveedor de pagos' ELSE 'Datos de prueba' END,
				to_char(g.monto_centimos/100.0,'FM999999990.00'), g.referencia
				FROM pagos g JOIN pedidos p ON p.id=g.pedido_id JOIN tiendas t ON t.id=p.tienda_id WHERE p.creado_en >= $1 AND p.creado_en < $2 ORDER BY p.creado_en`},
		"reclamos": {[]string{"Pedido", "Fecha", "Tienda", "Motivo", "Estado", "Resuelto"},
			`SELECT p.codigo, to_char(c.creado_en AT TIME ZONE 'America/Lima','DD/MM/YYYY HH24:MI'), t.nombre, initcap(replace(c.motivo,'_',' ')), initcap(replace(c.estado,'_',' ')), COALESCE(to_char(c.resuelto_en AT TIME ZONE 'America/Lima','DD/MM/YYYY'),'')
				FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id JOIN tiendas t ON t.id=p.tienda_id WHERE c.creado_en >= $1 AND c.creado_en < $2 ORDER BY c.creado_en`},
	}
	area := r.URL.Query().Get("area")
	q, ok := consultas[area]
	if !ok {
		return httpx.Invalido("Área no válida.")
	}
	rows, err := m.app.DB.QueryContext(ctx, q.sql, ini, fin)
	if err != nil {
		return err
	}
	defer rows.Close()
	filas := [][]string{q.cab}
	for rows.Next() {
		vals := make([]sql.NullString, len(q.cab))
		ptrs := make([]any, len(vals))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return err
		}
		fila := make([]string, len(vals))
		for i, v := range vals {
			fila[i] = strings.TrimSpace(v.String)
		}
		filas = append(filas, fila)
	}
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "descargar_reporte", "reporte", area, map[string]string{"mes": ini.Format("2006-01")})
	httpx.OK(w, map[string]any{"filas": filas})
	return nil
}
