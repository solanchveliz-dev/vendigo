package pedidos

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

type Modulo struct {
	app *core.App
	// ValidarCupo revisa que la tienda tenga ventas disponibles en su plan (lo registra el módulo de planes).
	ValidarCupo func(ctx context.Context, tiendaID string) error
}

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

func (m *Modulo) RutasVendedor(r chi.Router) {
	r.Method("GET", "/resumen", httpx.Handler(m.resumen))
	r.Method("GET", "/inicio", httpx.Handler(m.inicio))
	r.Method("GET", "/analitica", httpx.Handler(m.analitica))
	r.Method("GET", "/pedidos", httpx.Handler(m.listar))
	r.Method("GET", "/pedidos/{id}", httpx.Handler(m.obtener))
	r.Method("POST", "/pedidos/{id}/aceptar", httpx.Handler(m.aceptar))
	r.Method("POST", "/pedidos/{id}/rechazar", httpx.Handler(m.rechazar))
	r.Method("POST", "/pedidos/{id}/enviar", httpx.Handler(m.enviar))
	r.Method("POST", "/pedidos/{id}/listo-recojo", httpx.Handler(m.listoRecojo))
	r.Method("POST", "/pedidos/{id}/entregar-recojo", httpx.Handler(m.entregar))
	r.Method("POST", "/pedidos/{id}/entregar", httpx.Handler(m.entregar))
	r.Method("POST", "/pedidos/{id}/pago", httpx.Handler(m.informarPago))
	r.Method("POST", "/pedidos/{id}/devolucion", httpx.Handler(m.informarDevolucion))
	r.Method("GET", "/ventas", httpx.Handler(m.ventas))
	r.Method("GET", "/pedidos/{id}/etiqueta", httpx.Handler(m.etiqueta))
	r.Method("GET", "/reclamos", httpx.Handler(m.reclamos))
	r.Method("POST", "/reclamos/{id}/responder", httpx.Handler(m.responderReclamo))
	r.Method("POST", "/reclamos/{id}/devolver", httpx.Handler(m.devolverReclamo))
	r.Method("GET", "/notificaciones", httpx.Handler(m.notificaciones))
	r.Method("POST", "/notificaciones/leer", httpx.Handler(m.leerNotificaciones))
	r.Method("POST", "/notificaciones/{id}/leer", httpx.Handler(m.leerNotificacion))
	r.Method("GET", "/ayudas", httpx.Handler(m.ayudas))
	r.Method("GET", "/clientes", httpx.Handler(m.clientes))
	r.Method("GET", "/clientes/{id}", httpx.Handler(m.cliente))
	r.Method("PUT", "/clientes/{id}/nota", httpx.Handler(m.guardarNota))
	r.Method("POST", "/ayudas/{id}/responder", httpx.Handler(m.responderAyuda))
}

// Grupos del filtro de pedidos (los mismos nombres en la web y en la app).
var Grupos = map[string]string{
	"todos":       "TRUE",
	"por_aceptar": "p.estado='por_aceptar'",
	"por_enviar":  "p.estado='preparando' AND p.entrega<>'recojo'",
	"recogen":     "p.entrega='recojo' AND p.estado IN ('preparando','listo_recojo')",
	"en_camino":   "p.estado='enviado'",
	"terminados":  "p.estado IN ('entregado','rechazado','cancelado')",
}

var textoEstado = map[string]string{
	"por_aceptar":  "Por aceptar",
	"preparando":   "Por enviar",
	"listo_recojo": "Listo para recoger",
	"enviado":      "En camino",
	"entregado":    "Entregado",
	"rechazado":    "Rechazado",
	"cancelado":    "Cancelado",
}

func TextoEstado(estado, entrega string) string {
	if estado == "preparando" && entrega == "recojo" {
		return "Preparando para recojo"
	}
	return textoEstado[estado]
}

type Resumen struct {
	ID          string    `json:"id"`
	Codigo      string    `json:"codigo"`
	Comprador   string    `json:"comprador"`
	Entrega     string    `json:"entrega"`
	Estado      string    `json:"estado"`
	EstadoTexto string    `json:"estado_texto"`
	MetodoPago  string    `json:"metodo_pago"`
	PagoEstado  string    `json:"pago_estado"`
	PagoTexto   string    `json:"pago_texto"`
	Total       int       `json:"total_centimos"`
	Items       int       `json:"items"`
	Producto    string    `json:"producto"`
	ImagenURL   string    `json:"imagen_url"`
	Reclamo     *string   `json:"reclamo"`
	CreadoEn    time.Time `json:"creado_en"`
}

func (m *Modulo) listar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	grupo := r.URL.Query().Get("grupo")
	cond, ok := Grupos[grupo]
	if !ok {
		grupo, cond = "todos", "TRUE"
	}
	entrega := r.URL.Query().Get("entrega")
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, p.comprador_nombre, p.entrega, p.estado, p.metodo_pago, COALESCE((SELECT g.estado FROM pagos g WHERE g.pedido_id=p.id),'pendiente'),
		p.total_centimos, p.creado_en,
		(SELECT COALESCE(SUM(cantidad),0) FROM pedido_items i WHERE i.pedido_id=p.id),
		(SELECT i.nombre FROM pedido_items i WHERE i.pedido_id=p.id LIMIT 1),
		(SELECT i.imagen_key FROM pedido_items i WHERE i.pedido_id=p.id LIMIT 1),
		(SELECT estado FROM reclamos c WHERE c.pedido_id=p.id)
		FROM pedidos p WHERE p.tienda_id=$1 AND `+cond+`
		AND ($2='' OR p.entrega=$2)
		AND ($3='' OR p.codigo ILIKE '%'||$3||'%' OR p.comprador_nombre ILIKE '%'||$3||'%'
			OR EXISTS(SELECT 1 FROM pedido_items i WHERE i.pedido_id=p.id AND i.nombre ILIKE '%'||$3||'%'))
		ORDER BY CASE WHEN EXISTS(SELECT 1 FROM reclamos c WHERE c.pedido_id=p.id AND c.estado='abierto') THEN 0
			WHEN p.estado='por_aceptar' THEN 1 WHEN p.estado IN ('preparando','listo_recojo') THEN 2 WHEN p.estado='enviado' THEN 3 ELSE 4 END,
			p.creado_en DESC LIMIT 200`, tid, entrega, q)
	if err != nil {
		return err
	}
	defer rows.Close()
	lista := []Resumen{}
	for rows.Next() {
		var p Resumen
		var img sql.NullString
		var prod sql.NullString
		if err := rows.Scan(&p.ID, &p.Codigo, &p.Comprador, &p.Entrega, &p.Estado, &p.MetodoPago, &p.PagoEstado, &p.Total,
			&p.CreadoEn, &p.Items, &prod, &img, &p.Reclamo); err != nil {
			return err
		}
		p.Producto = prod.String
		if img.Valid {
			p.ImagenURL = m.app.Archivos.URLPublica(img.String)
		}
		p.EstadoTexto = TextoEstado(p.Estado, p.Entrega)
		p.PagoTexto = pagos.Textos[p.PagoEstado]
		lista = append(lista, p)
	}
	conteo := map[string]int{}
	for g, c := range Grupos {
		var n int
		m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM pedidos p WHERE p.tienda_id=$1 AND `+c, tid).Scan(&n)
		conteo[g] = n
	}
	httpx.OK(w, map[string]any{"pedidos": lista, "grupo": grupo, "conteo": conteo})
	return nil
}

// ---------- detalle ----------

type Item struct {
	Nombre    string `json:"nombre"`
	Variante  string `json:"variante"`
	ImagenURL string `json:"imagen_url"`
	Precio    int    `json:"precio_centimos"`
	Cantidad  int    `json:"cantidad"`
}

type Envio struct {
	Agencia     string    `json:"agencia"`
	NumeroOrden string    `json:"numero_orden"`
	ClaveRecojo string    `json:"clave_recojo"`
	BoletaURL   string    `json:"boleta_url"`
	Nota        string    `json:"nota"`
	Registrado  time.Time `json:"registrado_en"`
	// Solo para delivery con motorizado.
	MotorizadoNombre  string `json:"motorizado_nombre"`
	MotorizadoCelular string `json:"motorizado_celular"`
}

// Motorizado guardado por la tienda para elegirlo rápido al despachar.
type Motorizado struct {
	Nombre  string `json:"nombre"`
	Celular string `json:"celular"`
}

type Evento struct {
	Estado  string    `json:"estado"`
	Detalle string    `json:"detalle"`
	Fecha   time.Time `json:"fecha"`
}

type Reclamo struct {
	ID           string     `json:"id"`
	Motivo       string     `json:"motivo"`
	MotivoTexto  string     `json:"motivo_texto"`
	Descripcion  string     `json:"descripcion"`
	Fotos        []string   `json:"fotos"`
	Estado       string     `json:"estado"`
	Respuesta    *string    `json:"respuesta_vendedor"`
	Evidencias   []string   `json:"evidencias"`
	RespondidoEn *time.Time `json:"respondido_en"`
	CreadoEn     time.Time  `json:"creado_en"`
}

var MotivosReclamo = map[string]string{
	"no_llego": "No me llegó", "danado": "Llegó dañado", "distinto": "Es distinto a lo publicado",
	"incompleto": "Llegó incompleto", "otro": "Otro problema",
}

type Detalle struct {
	Resumen
	Celular       string   `json:"comprador_celular"`
	DNI           string   `json:"comprador_dni"`
	Direccion     string   `json:"direccion"`
	Distrito      string   `json:"distrito"`
	Ciudad        string   `json:"ciudad"`
	Referencia    string   `json:"referencia"`
	Agencia       string   `json:"agencia"`
	AgenciaSede   string   `json:"agencia_sede"`
	Nota          string   `json:"nota_comprador"`
	Subtotal      int      `json:"subtotal_centimos"`
	EnvioCosto    int      `json:"envio_centimos"`
	Comision      int      `json:"comision_reportada_centimos"` // solo si un proveedor la informa; VendiGo cobra 0 %
	Neto          int      `json:"neto_centimos"`
	Motivo        string   `json:"motivo_cancelacion"`
	ConfirmadoPor *string  `json:"confirmado_por"`
	ItemsLista    []Item   `json:"items_detalle"`
	Envio         *Envio   `json:"envio"`
	Eventos       []Evento `json:"eventos"`
	ReclamoDet    *Reclamo `json:"reclamo_detalle"`
	Acciones      []string `json:"acciones"`
	// Para la línea de tiempo y la tarjeta del cliente.
	AceptadoEn     *time.Time   `json:"aceptado_en"`
	EnviadoEn      *time.Time   `json:"enviado_en"`
	EntregadoEn    *time.Time   `json:"entregado_en"`
	PedidosCliente int          `json:"pedidos_cliente"`
	Motorizados    []Motorizado `json:"motorizados_guardados"`
	Ayuda          *Ayuda       `json:"ayuda"`
	Pago           *PagoInfo    `json:"pago"`
	Devoluciones   []Devolucion `json:"devoluciones"`
	CodigoEntrega  string       `json:"codigo_entrega,omitempty"` // solo para el comprador (su seguimiento)
}

// PagoInfo: cómo y en qué estado está el pago (lo hace el comprador directo a la tienda).
type PagoInfo struct {
	Estado         string       `json:"estado"`
	Texto          string       `json:"texto"`
	Origen         string       `json:"origen"`
	Metodo         string       `json:"metodo"`
	MetodoTexto    string       `json:"metodo_texto"`
	Momento        string       `json:"momento"`
	Monto          int          `json:"monto_centimos"`
	Adelanto       int          `json:"adelanto_centimos"` // lo que se paga antes cuando momento es "adelanto"
	Referencia     string       `json:"referencia"`
	ComprobanteURL string       `json:"comprobante_url"`
	InformadoEn    *time.Time   `json:"informado_en"`
	Eventos        []PagoEvento `json:"eventos"`
}

type PagoEvento struct {
	Estado  string    `json:"estado"`
	Texto   string    `json:"texto"`
	Detalle string    `json:"detalle"`
	Fecha   time.Time `json:"fecha"`
}

type Devolucion struct {
	Origen       string     `json:"origen"`
	Monto        int        `json:"monto_centimos"`
	Estado       string     `json:"estado"`
	EvidenciaURL string     `json:"evidencia_url"`
	Nota         string     `json:"nota"`
	InformadaEn  *time.Time `json:"informada_en"`
	CreadoEn     time.Time  `json:"creado_en"`
}

func (m *Modulo) cargar(ctx context.Context, tid, pid string) (*Detalle, error) {
	d := &Detalle{}
	var dni sql.NullString
	err := m.app.DB.QueryRowContext(ctx, `SELECT id, codigo, comprador_nombre, comprador_celular, comprador_dni_cifrado, entrega, estado,
		metodo_pago, subtotal_centimos, envio_centimos, total_centimos,
		direccion, distrito, ciudad, referencia, agencia, agencia_sede, nota_comprador, motivo_cancelacion, confirmado_por,
		creado_en, aceptado_en, enviado_en, entregado_en,
		(SELECT count(*) FROM pedidos x WHERE x.tienda_id=pedidos.tienda_id AND x.comprador_celular=pedidos.comprador_celular)
		FROM pedidos WHERE id::text=$1 AND tienda_id=$2`, pid, tid).Scan(
		&d.ID, &d.Codigo, &d.Comprador, &d.Celular, &dni, &d.Entrega, &d.Estado, &d.MetodoPago,
		&d.Subtotal, &d.EnvioCosto, &d.Total, &d.Direccion, &d.Distrito, &d.Ciudad, &d.Referencia,
		&d.Agencia, &d.AgenciaSede, &d.Nota, &d.Motivo, &d.ConfirmadoPor, &d.CreadoEn,
		&d.AceptadoEn, &d.EnviadoEn, &d.EntregadoEn, &d.PedidosCliente)
	if core.SinFilas(err) {
		return nil, httpx.ErrNoEncontrado
	}
	if err != nil {
		return nil, err
	}
	if dni.Valid {
		d.DNI, _ = m.app.Cifrador.Descifrar(dni.String)
	}
	d.EstadoTexto = TextoEstado(d.Estado, d.Entrega)
	if err := m.cargarPago(ctx, d); err != nil {
		return nil, err
	}
	d.Neto = d.Total - d.Comision

	rows, err := m.app.DB.QueryContext(ctx, `SELECT nombre, variante, imagen_key, precio_centimos, cantidad FROM pedido_items WHERE pedido_id=$1`, d.ID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var it Item
		var img sql.NullString
		rows.Scan(&it.Nombre, &it.Variante, &img, &it.Precio, &it.Cantidad)
		if img.Valid {
			it.ImagenURL = m.app.Archivos.URLPublica(img.String)
		}
		d.Items += it.Cantidad
		d.ItemsLista = append(d.ItemsLista, it)
	}
	rows.Close()
	if len(d.ItemsLista) > 0 {
		d.Producto, d.ImagenURL = d.ItemsLista[0].Nombre, d.ItemsLista[0].ImagenURL
	}

	var e Envio
	var boleta sql.NullString
	err = m.app.DB.QueryRowContext(ctx, `SELECT agencia, numero_orden, clave_recojo, boleta_key, nota, registrado_en, motorizado_nombre, motorizado_celular
		FROM envios WHERE pedido_id=$1`, d.ID).
		Scan(&e.Agencia, &e.NumeroOrden, &e.ClaveRecojo, &boleta, &e.Nota, &e.Registrado, &e.MotorizadoNombre, &e.MotorizadoCelular)
	if err == nil {
		if boleta.Valid {
			e.BoletaURL, _ = m.app.Archivos.URLLectura(ctx, boleta.String)
		}
		d.Envio = &e
	}

	rows, err = m.app.DB.QueryContext(ctx, `SELECT estado, detalle, creado_en FROM pedido_eventos WHERE pedido_id=$1 ORDER BY creado_en, id`, d.ID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var ev Evento
		rows.Scan(&ev.Estado, &ev.Detalle, &ev.Fecha)
		d.Eventos = append(d.Eventos, ev)
	}
	rows.Close()

	var rc Reclamo
	var fotos, evid []string
	err = m.app.DB.QueryRowContext(ctx, `SELECT id, motivo, descripcion, fotos, estado, respuesta_vendedor, evidencias, respondido_en, creado_en
		FROM reclamos WHERE pedido_id=$1`, d.ID).Scan(&rc.ID, &rc.Motivo, &rc.Descripcion, pq.Array(&fotos), &rc.Estado, &rc.Respuesta,
		pq.Array(&evid), &rc.RespondidoEn, &rc.CreadoEn)
	if err == nil {
		rc.MotivoTexto = MotivosReclamo[rc.Motivo]
		rc.Fotos, rc.Evidencias = m.firmar(ctx, fotos), m.firmar(ctx, evid)
		d.ReclamoDet = &rc
		d.Reclamo = &rc.Estado
	}
	d.Devoluciones = []Devolucion{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT origen, monto_centimos, estado, COALESCE(evidencia_key,''), nota, informada_en, creado_en
		FROM devoluciones WHERE pedido_id=$1 ORDER BY creado_en`, d.ID); err == nil {
		for rows.Next() {
			var x Devolucion
			var key string
			rows.Scan(&x.Origen, &x.Monto, &x.Estado, &key, &x.Nota, &x.InformadaEn, &x.CreadoEn)
			if key != "" {
				x.EvidenciaURL, _ = m.app.Archivos.URLLectura(ctx, key)
			}
			d.Devoluciones = append(d.Devoluciones, x)
		}
		rows.Close()
	}
	d.Acciones = acciones(d)
	if l, err := m.leerAyudas(ctx, tid, d.ID); err == nil && len(l) > 0 {
		d.Ayuda = &l[0]
	}
	d.Motorizados = []Motorizado{}
	if d.Entrega == "motorizado" {
		var raw []byte
		if m.app.DB.QueryRowContext(ctx, `SELECT motorizados FROM tiendas WHERE id=$1`, tid).Scan(&raw) == nil {
			json.Unmarshal(raw, &d.Motorizados)
		}
	}
	return d, nil
}

func (m *Modulo) firmar(ctx context.Context, keys []string) []string {
	out := []string{}
	for _, k := range keys {
		if u, err := m.app.Archivos.URLLectura(ctx, k); err == nil {
			out = append(out, u)
		}
	}
	return out
}

// acciones indica qué botones mostrar según el estado (la web y la app no deciden por su cuenta).
func acciones(d *Detalle) []string {
	out := []string{}
	if d.Pago != nil && d.Estado != "rechazado" && d.Estado != "cancelado" {
		switch d.Pago.Estado {
		case "pendiente", "comprobante_enviado", "no_recibido":
			out = append(out, "confirmar_pago")
		}
	}
	for _, x := range d.Devoluciones {
		if x.Estado == "pendiente_tienda" {
			out = append(out, "informar_devolucion")
			break
		}
	}
	listo := d.Pago == nil || pagos.PermiteAvanzar(d.Pago.Estado)
	switch d.Estado {
	case "por_aceptar":
		return append(out, "aceptar", "rechazar")
	case "preparando":
		if !listo {
			return append(out, "etiqueta")
		}
		if d.Entrega == "recojo" {
			return append(out, "listo_recojo", "etiqueta")
		}
		return append(out, "enviar", "etiqueta")
	case "listo_recojo":
		return append(out, "entregar")
	case "enviado":
		if d.Entrega == "motorizado" {
			return append(out, "entregar")
		}
	}
	if d.ReclamoDet != nil && d.ReclamoDet.Estado == "abierto" {
		out = append(out, "responder_reclamo")
	}
	return out
}

// cargarPago agrega al detalle el pago del pedido y su historial.
func (m *Modulo) cargarPago(ctx context.Context, d *Detalle) error {
	var p PagoInfo
	var comp sql.NullString
	var comision sql.NullInt64
	err := m.app.DB.QueryRowContext(ctx, `SELECT id, estado, origen, metodo, momento, monto_centimos, adelanto_centimos, referencia, comprobante_key, comision_reportada_centimos, informado_en
		FROM pagos WHERE pedido_id=$1`, d.ID).Scan(new(string), &p.Estado, &p.Origen, &p.Metodo, &p.Momento, &p.Monto, &p.Adelanto, &p.Referencia, &comp, &comision, &p.InformadoEn)
	if core.SinFilas(err) {
		return nil
	}
	if err != nil {
		return err
	}
	p.Texto, p.MetodoTexto = pagos.Textos[p.Estado], pagos.MetodosDirectos[p.Metodo]
	if p.MetodoTexto == "" {
		p.MetodoTexto = p.Metodo
	}
	if comp.Valid {
		p.ComprobanteURL, _ = m.app.Archivos.URLLectura(ctx, comp.String)
	}
	if comision.Valid {
		d.Comision = int(comision.Int64)
	}
	p.Eventos = []PagoEvento{}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT e.estado, e.detalle, e.creado_en FROM pago_eventos e JOIN pagos g ON g.id=e.pago_id
		WHERE g.pedido_id=$1 ORDER BY e.creado_en, e.id`, d.ID)
	if err == nil {
		for rows.Next() {
			var e PagoEvento
			rows.Scan(&e.Estado, &e.Detalle, &e.Fecha)
			e.Texto = pagos.Textos[e.Estado]
			p.Eventos = append(p.Eventos, e)
		}
		rows.Close()
	}
	d.Pago, d.PagoEstado, d.PagoTexto = &p, p.Estado, p.Texto
	return nil
}

func (m *Modulo) obtener(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	d, err := m.cargar(ctx, tid, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

// ---------- cambios de estado ----------

// cambiar bloquea el pedido, valida el estado actual y ejecuta fn dentro de una transacción.
func (m *Modulo) cambiar(r *http.Request, desde []string, fn func(tx *sql.Tx, tid, pid, codigo, entrega string) error) (*Detalle, error) {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return nil, err
	}
	pid := chi.URLParam(r, "id")
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var estado, codigo, entrega string
		err := tx.QueryRowContext(ctx, `SELECT estado, codigo, entrega FROM pedidos WHERE id::text=$1 AND tienda_id=$2 FOR UPDATE`, pid, tid).
			Scan(&estado, &codigo, &entrega)
		if core.SinFilas(err) {
			return httpx.ErrNoEncontrado
		}
		if err != nil {
			return err
		}
		valido := false
		for _, s := range desde {
			valido = valido || s == estado
		}
		if !valido {
			return httpx.Conflicto("estado_invalido", "Este pedido ya no está en ese paso. Actualiza la página.")
		}
		return fn(tx, tid, pid, codigo, entrega)
	})
	if err != nil {
		return nil, err
	}
	return m.cargar(ctx, tid, pid)
}

func evento(ctx context.Context, tx *sql.Tx, pid, estado, detalle string) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO pedido_eventos (pedido_id, estado, detalle) VALUES ($1,$2,$3)`, pid, estado, detalle)
	return err
}

// eventoConSMS registra el paso en el seguimiento y además se lo avisa por SMS al comprador (momentos clave).
func eventoConSMS(ctx context.Context, tx *sql.Tx, pid, estado, detalle string) error {
	if err := evento(ctx, tx, pid, estado, detalle); err != nil {
		return err
	}
	var codigo string
	tx.QueryRowContext(ctx, `SELECT codigo FROM pedidos WHERE id::text=$1`, pid).Scan(&codigo)
	billetera.SMSComprador(ctx, tx, pid, "pedido "+codigo+". "+detalle)
	return nil
}

func (m *Modulo) aceptar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	d, err := m.cambiar(r, []string{"por_aceptar"}, func(tx *sql.Tx, tid, pid, codigo, entrega string) error {
		if m.ValidarCupo != nil {
			if err := m.ValidarCupo(ctx, tid); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET estado='preparando', aceptado_en=now() WHERE id=$1`, pid); err != nil {
			return err
		}
		return eventoConSMS(ctx, tx, pid, "preparando", "La tienda aceptó tu pedido.")
	})
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

func (m *Modulo) rechazar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Motivo string `json:"motivo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Motivo = strings.TrimSpace(in.Motivo)
	if in.Motivo == "" {
		return httpx.Invalido("Cuéntale al comprador por qué no puedes atender el pedido.")
	}
	d, err := m.cambiar(r, []string{"por_aceptar"}, func(tx *sql.Tx, tid, pid, codigo, entrega string) error {
		if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET estado='rechazado', motivo_cancelacion=$2, cerrado_en=now() WHERE id=$1`, pid, in.Motivo); err != nil {
			return err
		}
		if err := devolverStock(ctx, tx, pid); err != nil {
			return err
		}
		devolver, err := pagos.AbrirDevolucion(ctx, tx, pid, "cancelacion")
		if err != nil {
			return err
		}
		texto := "La tienda no pudo atender el pedido: " + in.Motivo + "."
		if devolver {
			texto += " Como ya pagaste, la tienda debe devolverte tu dinero; verás aquí cuando lo informe."
		} else {
			texto += " No se realizó ningún cobro."
		}
		return eventoConSMS(ctx, tx, pid, "rechazado", texto)
	})
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

func devolverStock(ctx context.Context, tx *sql.Tx, pid string) error {
	if _, err := tx.ExecContext(ctx, `UPDATE producto_variantes v SET stock=v.stock+i.cantidad FROM pedido_items i
		WHERE i.pedido_id=$1 AND i.variante_id=v.id`, pid); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE productos p SET stock=p.stock+i.cantidad FROM pedido_items i
		WHERE i.pedido_id=$1 AND i.producto_id=p.id`, pid)
	return err
}

type envioReq struct {
	Agencia     string `json:"agencia"`
	NumeroOrden string `json:"numero_orden"`
	ClaveRecojo string `json:"clave_recojo"`
	BoletaKey   string `json:"boleta_key"`
	Nota        string `json:"nota"`
	// Motorizado: quién lo lleva y si se guarda en "mis motorizados".
	MotorizadoNombre  string `json:"motorizado_nombre"`
	MotorizadoCelular string `json:"motorizado_celular"`
	Guardar           bool   `json:"guardar"`
}

func (m *Modulo) enviar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in envioReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	d, err := m.cambiar(r, []string{"preparando"}, func(tx *sql.Tx, tid, pid, codigo, entrega string) error {
		if err := pagoListo(ctx, tx, pid); err != nil {
			return err
		}
		var detalle string
		switch entrega {
		case "agencia":
			// Como en el prototipo: basta el código de envío o la foto de la boleta.
			in.NumeroOrden = strings.TrimSpace(in.NumeroOrden)
			if in.NumeroOrden == "" && in.BoletaKey == "" {
				return httpx.Invalido("Escribe el código o sube la foto de la boleta de envío (es tu prueba si hay reclamo).")
			}
			if len(in.NumeroOrden) > 40 {
				return httpx.Invalido("El código de envío es muy largo.")
			}
			if in.BoletaKey != "" && !strings.HasPrefix(in.BoletaKey, "boleta/"+tid+"/") {
				return httpx.Invalido("La boleta no pertenece a tu tienda.")
			}
			in.Agencia = strings.TrimSpace(in.Agencia)
			if in.Agencia == "" {
				tx.QueryRowContext(ctx, `SELECT agencia FROM pedidos WHERE id=$1`, pid).Scan(&in.Agencia)
			}
			if in.NumeroOrden != "" {
				detalle = fmt.Sprintf("Enviado por %s. Código %s", in.Agencia, in.NumeroOrden)
			} else {
				detalle = fmt.Sprintf("Enviado por %s. La tienda registró la boleta de envío", in.Agencia)
			}
			in.MotorizadoNombre, in.MotorizadoCelular = "", ""
		case "motorizado":
			in.MotorizadoNombre = strings.TrimSpace(in.MotorizadoNombre)
			in.MotorizadoCelular = strings.ReplaceAll(strings.TrimSpace(in.MotorizadoCelular), " ", "")
			if len([]rune(in.MotorizadoNombre)) < 2 || len([]rune(in.MotorizadoNombre)) > 60 {
				return httpx.Invalido("Escribe el nombre de quien lleva el pedido.")
			}
			if !celularValido(in.MotorizadoCelular) {
				return httpx.Invalido("El celular del motorizado debe tener 9 dígitos y empezar con 9.")
			}
			if in.Guardar {
				nuevo, _ := json.Marshal([]Motorizado{{Nombre: in.MotorizadoNombre, Celular: in.MotorizadoCelular}})
				if _, err := tx.ExecContext(ctx, `UPDATE tiendas SET motorizados = motorizados || $2::jsonb
					WHERE id=$1 AND jsonb_array_length(motorizados) < 10
					AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(motorizados) e WHERE e->>'celular' = $3)`,
					tid, string(nuevo), in.MotorizadoCelular); err != nil {
					return err
				}
			}
			in.Agencia, in.NumeroOrden, in.ClaveRecojo, in.BoletaKey = "Motorizado", "", "", ""
			detalle = fmt.Sprintf("Tu pedido va en camino con %s (%s). Pagas al recibir.", in.MotorizadoNombre, in.MotorizadoCelular)
		default:
			return httpx.Conflicto("estado_invalido", "Los pedidos de recojo no se envían.")
		}
		var boleta any
		if in.BoletaKey != "" {
			boleta = in.BoletaKey
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO envios (pedido_id, agencia, numero_orden, clave_recojo, boleta_key, nota, motorizado_nombre, motorizado_celular)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
			ON CONFLICT (pedido_id) DO UPDATE SET agencia=$2, numero_orden=$3, clave_recojo=$4, boleta_key=$5, nota=$6,
			motorizado_nombre=$7, motorizado_celular=$8, registrado_en=now()`,
			pid, in.Agencia, in.NumeroOrden, strings.TrimSpace(in.ClaveRecojo), boleta, strings.TrimSpace(in.Nota),
			in.MotorizadoNombre, in.MotorizadoCelular); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET estado='enviado', enviado_en=now() WHERE id=$1`, pid); err != nil {
			return err
		}
		return eventoConSMS(ctx, tx, pid, "enviado", detalle)
	})
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

func celularValido(c string) bool {
	if len(c) != 9 || c[0] != '9' {
		return false
	}
	for _, r := range c {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func (m *Modulo) listoRecojo(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	d, err := m.cambiar(r, []string{"preparando"}, func(tx *sql.Tx, tid, pid, codigo, entrega string) error {
		if entrega != "recojo" {
			return httpx.Conflicto("estado_invalido", "Este pedido no es para recoger en tienda.")
		}
		if err := pagoListo(ctx, tx, pid); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET estado='listo_recojo' WHERE id=$1`, pid); err != nil {
			return err
		}
		return eventoConSMS(ctx, tx, pid, "listo_recojo", "Tu pedido está listo. Muestra tu código de recojo en la tienda.")
	})
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

// etiqueta devuelve los datos para imprimir y pegar en el paquete. Por privacidad no incluye el contenido.
func (m *Modulo) etiqueta(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	d, err := m.cargar(ctx, tid, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	var tienda, wsp string
	m.app.DB.QueryRowContext(ctx, `SELECT nombre, whatsapp FROM tiendas WHERE id=$1`, tid).Scan(&tienda, &wsp)
	httpx.OK(w, map[string]any{
		"codigo": d.Codigo, "entrega": d.Entrega, "remitente": tienda, "remitente_celular": wsp,
		"destinatario": d.Comprador, "celular": d.Celular, "dni": d.DNI,
		"direccion": d.Direccion, "distrito": d.Distrito, "ciudad": d.Ciudad, "referencia": d.Referencia,
		"agencia": d.Agencia, "agencia_sede": d.AgenciaSede,
	})
	return nil
}

// ---------- reclamos ----------

func (m *Modulo) reclamos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT c.id, p.id, p.codigo, p.comprador_nombre, c.motivo, c.estado, p.total_centimos, c.creado_en
		FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id WHERE p.tienda_id=$1 ORDER BY (c.estado='abierto') DESC, c.creado_en DESC`, tid)
	if err != nil {
		return err
	}
	defer rows.Close()
	type fila struct {
		ID          string    `json:"id"`
		PedidoID    string    `json:"pedido_id"`
		Codigo      string    `json:"codigo"`
		Comprador   string    `json:"comprador"`
		Motivo      string    `json:"motivo"`
		MotivoTexto string    `json:"motivo_texto"`
		Estado      string    `json:"estado"`
		Bloqueado   int       `json:"total_centimos"`
		CreadoEn    time.Time `json:"creado_en"`
	}
	out := []fila{}
	for rows.Next() {
		var f fila
		rows.Scan(&f.ID, &f.PedidoID, &f.Codigo, &f.Comprador, &f.Motivo, &f.Estado, &f.Bloqueado, &f.CreadoEn)
		f.MotivoTexto = MotivosReclamo[f.Motivo]
		out = append(out, f)
	}
	httpx.OK(w, map[string]any{"reclamos": out})
	return nil
}

// devolverReclamo: la tienda acepta el reclamo y se le devuelve todo el dinero al cliente.
func (m *Modulo) devolverReclamo(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var pid string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var codigo string
		err := tx.QueryRowContext(ctx, `SELECT p.id, p.codigo FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id
			WHERE c.id::text=$1 AND p.tienda_id=$2 AND c.estado IN ('abierto','en_revision') FOR UPDATE OF c`, chi.URLParam(r, "id"), tid).Scan(&pid, &codigo)
		if core.SinFilas(err) {
			return httpx.Conflicto("reclamo_cerrado", "Este reclamo ya se resolvió o no existe.")
		}
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE reclamos SET estado='a_favor_comprador', respuesta_vendedor=COALESCE(respuesta_vendedor, 'La tienda aceptó devolver el dinero.'),
			respondido_en=COALESCE(respondido_en, now()), resuelto_en=now() WHERE pedido_id=$1`, pid); err != nil {
			return err
		}
		if _, err := pagos.AbrirDevolucion(ctx, tx, pid, "reclamo"); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET estado='cancelado', motivo_cancelacion='La tienda aceptó el reclamo y debe devolver el dinero', cerrado_en=now() WHERE id=$1`, pid); err != nil {
			return err
		}
		u, _ := httpx.UsuarioDe(ctx)
		m.app.Auditar(ctx, tx, u.ID, "devolver_reclamo", "pedido", pid, nil)
		return eventoConSMS(ctx, tx, pid, "cancelado", "La tienda aceptó tu reclamo y debe devolverte tu dinero. Verás aquí cuando informe la devolución.")
	})
	if err != nil {
		return err
	}
	d, err := m.cargar(ctx, tid, pid)
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

func (m *Modulo) responderReclamo(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Mensaje    string   `json:"mensaje"`
		Evidencias []string `json:"evidencias"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Mensaje = strings.TrimSpace(in.Mensaje)
	if len([]rune(in.Mensaje)) < 10 {
		return httpx.Invalido("Explica lo que pasó en al menos 10 caracteres.")
	}
	for _, k := range in.Evidencias {
		if !strings.HasPrefix(k, "boleta/"+tid+"/") && !strings.HasPrefix(k, "reclamo/"+tid+"/") {
			return httpx.Invalido("Una de las pruebas no pertenece a tu tienda.")
		}
	}
	if in.Evidencias == nil {
		in.Evidencias = []string{}
	}
	var pid string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		// La boleta del envío se adjunta sola como prueba.
		var boleta sql.NullString
		err := tx.QueryRowContext(ctx, `UPDATE reclamos c SET respuesta_vendedor=$3, evidencias=$4, estado='en_revision', respondido_en=now()
			FROM pedidos p WHERE c.id::text=$1 AND p.id=c.pedido_id AND p.tienda_id=$2 AND c.estado='abierto'
			RETURNING p.id, (SELECT boleta_key FROM envios e WHERE e.pedido_id=p.id)`,
			chi.URLParam(r, "id"), tid, in.Mensaje, pq.Array(in.Evidencias)).Scan(&pid, &boleta)
		if core.SinFilas(err) {
			return httpx.Conflicto("reclamo_cerrado", "Este reclamo ya fue respondido o no existe.")
		}
		if err != nil {
			return err
		}
		if boleta.Valid {
			tx.ExecContext(ctx, `UPDATE reclamos SET evidencias = array_append(evidencias, $2) WHERE pedido_id=$1 AND NOT ($2 = ANY(evidencias))`, pid, boleta.String)
		}
		u, _ := httpx.UsuarioDe(ctx)
		m.app.Auditar(ctx, tx, u.ID, "responder_reclamo", "pedido", pid, nil)
		return eventoConSMS(ctx, tx, pid, "reclamo", "La tienda respondió tu reclamo. VendiGo revisará las pruebas.")
	})
	if err != nil {
		return err
	}
	d, err := m.cargar(ctx, tid, pid)
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

// ---------- inicio del vendedor ----------

func (m *Modulo) resumen(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	cont := map[string]int{}
	for _, g := range []string{"por_aceptar", "por_enviar", "recogen", "en_camino"} {
		var n int
		m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM pedidos p WHERE p.tienda_id=$1 AND `+Grupos[g], tid).Scan(&n)
		cont[g] = n
	}
	var reclamos, preguntas, noLeidas, ayudas int
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id WHERE p.tienda_id=$1 AND c.estado='abierto'`, tid).Scan(&reclamos)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM preguntas q JOIN productos p ON p.id=q.producto_id WHERE p.tienda_id=$1 AND q.respuesta IS NULL`, tid).Scan(&preguntas)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM ayudas_pedido a JOIN pedidos p ON p.id=a.pedido_id WHERE p.tienda_id=$1 AND a.abierta`, tid).Scan(&ayudas)
	u, _ := httpx.UsuarioDe(ctx)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM notificaciones WHERE usuario_id=$1 AND NOT leida`, u.ID).Scan(&noLeidas)

	var hoy, mes, pedidosMes, stockBajo, clientes, publicados int
	m.app.DB.QueryRowContext(ctx, `SELECT
		COALESCE(SUM(total_centimos) FILTER (WHERE (creado_en AT TIME ZONE 'America/Lima')::date = (now() AT TIME ZONE 'America/Lima')::date), 0),
		COALESCE(SUM(total_centimos), 0), count(*)
		FROM pedidos WHERE tienda_id=$1 AND estado NOT IN ('rechazado','cancelado')
		AND (creado_en AT TIME ZONE 'America/Lima') >= date_trunc('month', now() AT TIME ZONE 'America/Lima')`, tid).Scan(&hoy, &mes, &pedidosMes)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM productos WHERE tienda_id=$1 AND NOT eliminado AND activo AND stock <= 3`, tid).Scan(&stockBajo)
	m.app.DB.QueryRowContext(ctx, `SELECT count(DISTINCT comprador_celular) FROM pedidos WHERE tienda_id=$1`, tid).Scan(&clientes)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM productos WHERE tienda_id=$1 AND NOT eliminado AND activo`, tid).Scan(&publicados)

	// Ventas de los últimos 7 días para el gráfico del inicio.
	// Los días se cuentan en hora de Perú.
	rows, err := m.app.DB.QueryContext(ctx, `SELECT d::date, COALESCE(SUM(p.total_centimos),0)
		FROM generate_series((now() AT TIME ZONE 'America/Lima')::date - 6, (now() AT TIME ZONE 'America/Lima')::date, interval '1 day') d
		LEFT JOIN pedidos p ON p.tienda_id=$1 AND (p.creado_en AT TIME ZONE 'America/Lima')::date = d::date AND p.estado NOT IN ('rechazado','cancelado')
		GROUP BY d ORDER BY d`, tid)
	if err != nil {
		return err
	}
	type dia struct {
		Fecha string `json:"fecha"`
		Total int    `json:"total_centimos"`
	}
	semana := []dia{}
	for rows.Next() {
		var f time.Time
		var t int
		rows.Scan(&f, &t)
		semana = append(semana, dia{Fecha: f.Format("2006-01-02"), Total: t})
	}
	rows.Close()

	// Pagos que la tienda debe revisar (no es un saldo: VendiGo no guarda dinero).
	var cobros struct {
		PorConfirmar int `json:"pagos_por_confirmar"`
		Monto        int `json:"pagos_por_confirmar_centimos"`
		Devoluciones int `json:"devoluciones_pendientes"`
	}
	m.app.DB.QueryRowContext(ctx, `SELECT count(*), COALESCE(SUM(g.monto_centimos),0) FROM pagos g JOIN pedidos p ON p.id=g.pedido_id
		WHERE p.tienda_id=$1 AND g.estado IN ('pendiente','comprobante_enviado','no_recibido') AND p.estado NOT IN ('rechazado','cancelado')`, tid).Scan(&cobros.PorConfirmar, &cobros.Monto)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM devoluciones d JOIN pedidos p ON p.id=d.pedido_id WHERE p.tienda_id=$1 AND d.estado='pendiente_tienda'`, tid).Scan(&cobros.Devoluciones)
	httpx.OK(w, map[string]any{
		"pedidos": cont, "reclamos_abiertos": reclamos, "preguntas_pendientes": preguntas, "ayudas_abiertas": ayudas, "notificaciones_no_leidas": noLeidas,
		"vendido_hoy_centimos": hoy, "vendido_mes_centimos": mes, "pedidos_mes": pedidosMes, "stock_bajo": stockBajo,
		"clientes": clientes, "productos_publicados": publicados,
		"semana": semana, "cobros": cobros,
	})
	return nil
}

// ---------- notificaciones ----------

func (m *Modulo) notificaciones(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	// tipo: pedidos, pagos, consultas o inventario (vacío = todas).
	tipo := r.URL.Query().Get("tipo")
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id, titulo, cuerpo, enlace, leida, creado_en, tipo FROM notificaciones
		WHERE usuario_id=$1 AND ($2 = '' OR tipo = $2) ORDER BY creado_en DESC LIMIT 50`, u.ID, tipo)
	if err != nil {
		return err
	}
	defer rows.Close()
	type n struct {
		ID       string    `json:"id"`
		Titulo   string    `json:"titulo"`
		Cuerpo   string    `json:"cuerpo"`
		Enlace   string    `json:"enlace"`
		Leida    bool      `json:"leida"`
		CreadoEn time.Time `json:"creado_en"`
		Tipo     string    `json:"tipo"`
	}
	out := []n{}
	for rows.Next() {
		var x n
		rows.Scan(&x.ID, &x.Titulo, &x.Cuerpo, &x.Enlace, &x.Leida, &x.CreadoEn, &x.Tipo)
		out = append(out, x)
	}
	httpx.OK(w, map[string]any{"notificaciones": out})
	return nil
}

func (m *Modulo) leerNotificacion(w http.ResponseWriter, r *http.Request) error {
	u, _ := httpx.UsuarioDe(r.Context())
	m.app.DB.ExecContext(r.Context(), `UPDATE notificaciones SET leida=true WHERE usuario_id=$1 AND id::text=$2`, u.ID, chi.URLParam(r, "id"))
	httpx.OK(w, map[string]string{"mensaje": "Listo."})
	return nil
}

func (m *Modulo) leerNotificaciones(w http.ResponseWriter, r *http.Request) error {
	u, _ := httpx.UsuarioDe(r.Context())
	m.app.DB.ExecContext(r.Context(), `UPDATE notificaciones SET leida=true WHERE usuario_id=$1 AND NOT leida`, u.ID)
	httpx.OK(w, map[string]string{"mensaje": "Listo."})
	return nil
}

// ResolverReclamo lo usa el administrador cuando la tienda y el comprador no se ponen de acuerdo.
// aFavor: "comprador" (se devuelve el dinero y se cancela el pedido) o "vendedor" (el dinero sigue su curso).
func ResolverReclamo(ctx context.Context, app *core.App, tx *sql.Tx, reclamoID, aFavor, nota, adminID string) (string, error) {
	var pid, tid, codigo, estado, motivo string
	err := tx.QueryRowContext(ctx, `SELECT p.id, p.tienda_id, p.codigo, p.estado, c.motivo FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id
		WHERE c.id::text=$1 AND c.estado IN ('abierto','en_revision') FOR UPDATE OF c`, reclamoID).Scan(&pid, &tid, &codigo, &estado, &motivo)
	if core.SinFilas(err) {
		return "", httpx.Conflicto("reclamo_cerrado", "Este reclamo ya se resolvió o no existe.")
	}
	if err != nil {
		return "", err
	}
	switch aFavor {
	case "comprador":
		if _, err := tx.ExecContext(ctx, `UPDATE reclamos SET estado='a_favor_comprador', nota_admin=$2, resuelto_en=now() WHERE id::text=$1`, reclamoID, nota); err != nil {
			return "", err
		}
		devolver, err := pagos.AbrirDevolucion(ctx, tx, pid, "reclamo")
		if err != nil {
			return "", err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET estado='cancelado', motivo_cancelacion='VendiGo resolvió el reclamo a favor del comprador', cerrado_en=now() WHERE id=$1`, pid); err != nil {
			return "", err
		}
		texto := "VendiGo revisó tu reclamo y te dio la razón."
		aviso := "Pedido " + codigo + ": " + nota
		if devolver {
			texto += " La tienda debe devolverte tu dinero; verás aquí cuando lo informe."
			aviso += " Devuelve el pago al comprador e infórmalo con tu captura desde el pedido."
			if motivo == "no_llego" {
				aviso += " Tu tienda seguirá suspendida hasta que informes la devolución."
			}
		}
		if err := eventoConSMS(ctx, tx, pid, "cancelado", texto); err != nil {
			return "", err
		}
		billetera.Notificar(ctx, tx, tid, "Reclamo resuelto a favor del comprador", aviso, "/vendedor/pedidos/"+pid)
		billetera.SMSTienda(ctx, tx, tid, "VendiGo resolvió el reclamo del pedido "+codigo+" a favor del cliente. Revisa qué hacer:", "/vendedor/pedidos/"+pid)
	case "vendedor":
		if _, err := tx.ExecContext(ctx, `UPDATE reclamos SET estado='a_favor_vendedor', nota_admin=$2, resuelto_en=now() WHERE id::text=$1`, reclamoID, nota); err != nil {
			return "", err
		}
		if estado == "enviado" {
			// Sin esto el pedido se quedaría "enviado" para siempre: la confirmación automática no toca pedidos con reclamo.
			if err := MarcarEntregado(ctx, tx, pid, "vendigo"); err != nil {
				return "", err
			}
		} else if err := evento(ctx, tx, pid, estado, "VendiGo revisó el reclamo y las pruebas de la tienda. El pedido queda como entregado."); err != nil {
			return "", err
		}
		billetera.SMSComprador(ctx, tx, pid, "pedido "+codigo+". VendiGo revisó tu reclamo y las pruebas de la tienda: el pedido queda como entregado.")
		aviso := "Pedido " + codigo + ": el pedido queda como entregado."
		if motivo == "no_llego" {
			aviso += " Tu tienda ya puede recibir pedidos de nuevo."
		}
		billetera.Notificar(ctx, tx, tid, "Reclamo resuelto a tu favor", aviso, "/vendedor/cobros/reclamo/"+pid)
		billetera.SMSTienda(ctx, tx, tid, aviso, "/vendedor/cobros/reclamo/"+pid)
	default:
		return "", httpx.Invalido("Elige a favor de quién se resuelve.")
	}
	app.Auditar(ctx, tx, adminID, "resolver_reclamo", "reclamo", reclamoID, map[string]string{"a_favor": aFavor, "nota": nota, "pedido": codigo})
	return pid, nil
}

// CargarComoAdmin arma el detalle de cualquier pedido (por id o por código VG-…) para el panel admin.
// Solo lectura: sin acciones y con el DNI del comprador enmascarado.
func CargarComoAdmin(ctx context.Context, app *core.App, ref string) (*Detalle, string, error) {
	var id, tid string
	err := app.DB.QueryRowContext(ctx, `SELECT id, tienda_id FROM pedidos WHERE id::text=$1 OR codigo=upper($1)`, ref).Scan(&id, &tid)
	if core.SinFilas(err) {
		return nil, "", httpx.ErrNoEncontrado
	}
	if err != nil {
		return nil, "", err
	}
	d, err := (&Modulo{app: app}).cargar(ctx, tid, id)
	if err != nil {
		return nil, "", err
	}
	if n := len(d.DNI); n > 4 {
		d.DNI = "•••• " + d.DNI[n-4:]
	}
	d.Acciones, d.Motorizados, d.Ayuda = []string{}, []Motorizado{}, nil
	return d, tid, nil
}

// TiendaPago: datos para que el comprador le pague directo a la tienda.
type TiendaPago struct {
	Nombre   string   `json:"nombre"`
	Slug     string   `json:"slug"`
	Yape     string   `json:"yape_numero"`
	Plin     string   `json:"plin_numero"`
	Titular  string   `json:"pago_titular"`
	QRURL    string   `json:"pago_qr_url"`
	PlinQR   string   `json:"plin_qr_url"`
	Tarjeta  string   `json:"tarjeta_link"`
	Marcas   []string `json:"tarjeta_marcas"`
	Banco    string   `json:"transf_banco"`
	Cuenta   string   `json:"transf_cuenta"`
	CCI      string   `json:"transf_cci"`
	TitularB string   `json:"transf_titular"`
	Whatsapp string   `json:"whatsapp"`
}

// CargarComoComprador arma el seguimiento del pedido para el comprador (por su enlace secreto).
// Incluye el código de entrega y los datos de pago de la tienda.
func CargarComoComprador(ctx context.Context, app *core.App, token string) (*Detalle, *TiendaPago, error) {
	if len(token) < 20 {
		return nil, nil, httpx.ErrNoEncontrado
	}
	var id, tid, codigoEntrega string
	err := app.DB.QueryRowContext(ctx, `SELECT id, tienda_id, codigo_recojo FROM pedidos WHERE token_seguimiento=$1`, token).Scan(&id, &tid, &codigoEntrega)
	if core.SinFilas(err) {
		return nil, nil, httpx.ErrNoEncontrado
	}
	if err != nil {
		return nil, nil, err
	}
	d, err := (&Modulo{app: app}).cargar(ctx, tid, id)
	if err != nil {
		return nil, nil, err
	}
	if n := len(d.DNI); n > 4 {
		d.DNI = "•••• " + d.DNI[n-4:]
	}
	if d.Entrega != "agencia" {
		d.CodigoEntrega = codigoEntrega
	}
	d.Motorizados, d.Ayuda = []Motorizado{}, nil
	// Lo que puede hacer el comprador ahora.
	d.Acciones = []string{}
	if d.Pago != nil && d.Estado != "rechazado" && d.Estado != "cancelado" {
		switch d.Pago.Estado {
		case "pendiente", "no_recibido", "comprobante_enviado":
			d.Acciones = append(d.Acciones, "enviar_comprobante")
		}
	}
	if d.Estado == "enviado" && d.Entrega == "agencia" {
		d.Acciones = append(d.Acciones, "confirmar_recibido")
	}
	if d.ReclamoDet == nil && (d.Estado == "enviado" || (d.Estado == "entregado" && d.EntregadoEn != nil && time.Since(*d.EntregadoEn) <= DiasReclamo*24*time.Hour)) {
		d.Acciones = append(d.Acciones, "reclamar")
	}
	var t TiendaPago
	var qr, plinQR sql.NullString
	app.DB.QueryRowContext(ctx, `SELECT nombre, slug, yape_numero, plin_numero, pago_titular, pago_qr_key, whatsapp, tarjeta_link,
		plin_qr_key, tarjeta_marcas, transf_banco, transf_cuenta, transf_cci, transf_titular FROM tiendas WHERE id=$1`, tid).
		Scan(&t.Nombre, &t.Slug, &t.Yape, &t.Plin, &t.Titular, &qr, &t.Whatsapp, &t.Tarjeta,
			&plinQR, pq.Array(&t.Marcas), &t.Banco, &t.Cuenta, &t.CCI, &t.TitularB)
	if qr.Valid {
		t.QRURL = app.Archivos.URLPublica(qr.String)
	}
	if plinQR.Valid {
		t.PlinQR = app.Archivos.URLPublica(plinQR.String)
	}
	if t.Marcas == nil {
		t.Marcas = []string{}
	}
	return d, &t, nil
}

// IDPorToken devuelve el id del pedido de un enlace de seguimiento.
func IDPorToken(ctx context.Context, q core.Ejecutor, token string) (id, tienda, codigo string, err error) {
	err = q.QueryRowContext(ctx, `SELECT id, tienda_id, codigo FROM pedidos WHERE token_seguimiento=$1 AND length($1) >= 20`, token).Scan(&id, &tienda, &codigo)
	if core.SinFilas(err) {
		err = httpx.ErrNoEncontrado
	}
	return
}
