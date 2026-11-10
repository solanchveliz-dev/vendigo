package tiendas

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

type Modulo struct{ app *core.App }

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

var Rubros = []string{"moda", "accesorios", "belleza", "comida", "hogar", "tecnologia", "artesania", "mascotas", "deportes", "otros"}
var Agencias = []string{"Shalom", "Olva Courier", "Marvisur", "Flores", "Otra"}

// RutasVendedor se montan en /vendedor (requieren sesión de vendedor).
func (m *Modulo) RutasVendedor(r chi.Router) {
	r.Method("GET", "/tienda", httpx.Handler(m.obtener))
	r.Method("PUT", "/tienda", httpx.Handler(m.actualizar))
	r.Method("PUT", "/tienda/entrega", httpx.Handler(m.actualizarEntrega))
	r.Method("PUT", "/tienda/estilo", httpx.Handler(m.guardarEstilo))
	r.Method("PUT", "/tienda/pagos", httpx.Handler(m.guardarPagos))
	r.Method("GET", "/tienda/ajustes", httpx.Handler(m.ajustes))
	r.Method("PUT", "/tienda/ajustes", httpx.Handler(m.guardarAjustes))
	r.Method("POST", "/archivos", httpx.Handler(m.pedirSubida))
}

// RutasCuenta: cualquier usuario con sesión puede crear su tienda (pasa a ser vendedor).
func (m *Modulo) RutasCuenta(r chi.Router) {
	r.Method("POST", "/tienda", httpx.Handler(m.crear))
}

func (m *Modulo) RutasPublicas(r chi.Router) {
	r.Method("GET", "/tiendas/slug-disponible", httpx.Handler(m.slugDisponible))
	r.Method("GET", "/tiendas/{slug}", httpx.Handler(m.publica))
	r.Method("POST", "/tiendas/{slug}/visitas", httpx.Handler(m.registrarVisita))
	r.Method("GET", "/catalogos", httpx.Handler(m.catalogos))
}

// ID devuelve la tienda del usuario o un error claro si todavía no la crea.
func ID(ctx context.Context, app *core.App) (string, error) {
	u, ok := httpx.UsuarioDe(ctx)
	if !ok {
		return "", httpx.ErrNoAutorizado
	}
	var id string
	err := app.DB.QueryRowContext(ctx, `SELECT id FROM tiendas WHERE usuario_id=$1`, u.ID).Scan(&id)
	if core.SinFilas(err) {
		return "", httpx.NuevoError(http.StatusConflict, "sin_tienda", "Primero crea tu tienda.")
	}
	return id, err
}

// DeUsuario se usa en /me para indicar si el usuario ya tiene tienda.
func (m *Modulo) DeUsuario(ctx context.Context, usuarioID string) *string {
	var id string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT id::text FROM tiendas WHERE usuario_id=$1`, usuarioID).Scan(&id); err != nil {
		return nil
	}
	return &id
}

type Tienda struct {
	ID          string  `json:"id"`
	Nombre      string  `json:"nombre"`
	Slug        string  `json:"slug"`
	Rubro       string  `json:"rubro"`
	Descripcion string  `json:"descripcion"`
	Ciudad      string  `json:"ciudad"`
	Distrito    string  `json:"distrito"`
	LogoKey     *string `json:"logo_key"`
	LogoURL     string  `json:"logo_url"`
	PortadaKey  *string `json:"portada_key"`
	PortadaURL  string  `json:"portada_url"`
	Instagram   string  `json:"instagram"`
	Facebook    string  `json:"facebook"`
	Tiktok      string  `json:"tiktok"`
	Whatsapp    string  `json:"whatsapp"`
	Correo      string  `json:"correo"`
	Horario     string  `json:"horario"`
	Politicas   string  `json:"politicas"`
	Entrega     Entrega `json:"entrega"`
	Reputacion  string  `json:"reputacion"`
	Enlace      string  `json:"enlace"`
	Pausada     bool    `json:"pausada"`
	TemaColor   string  `json:"tema_color"`
	TemaFuente  string  `json:"tema_fuente"`
	Prefijo     string  `json:"prefijo_pedido"`
	DestacadoID *string `json:"destacado_id"`
	Aviso       string  `json:"aviso"`
	Historia    string  `json:"historia"`
	HistoriaKey *string `json:"historia_foto_key"`
	HistoriaURL string  `json:"historia_foto_url"`
	VendeDesde  *int    `json:"vende_desde"`
	// Pago directo a la tienda (VendiGo no recibe el dinero)
	YapeNumero  string   `json:"yape_numero"`
	PlinNumero  string   `json:"plin_numero"`
	PagoTitular string   `json:"pago_titular"`
	PagoQRKey   *string  `json:"pago_qr_key"`
	PagoQRURL   string   `json:"pago_qr_url"`
	MetodosPago []string `json:"metodos_pago"`
}

type Entrega struct {
	Recojo          bool     `json:"recojo"`
	DireccionRecojo string   `json:"direccion_recojo"`
	HorarioRecojo   string   `json:"horario_recojo"`
	Agencia         bool     `json:"agencia"`
	Agencias        []string `json:"agencias"`
	Motorizado      bool     `json:"motorizado"`
	CostoMotorizado int      `json:"costo_motorizado_centimos"`
	ZonasMotorizado string   `json:"zonas_motorizado"`
	Instrucciones   string   `json:"instrucciones_recojo"`
	DiasRecojo      []int64  `json:"dias_recojo"`
	AdelantoPct     int      `json:"adelanto_pct"` // adelanto del recojo
	RecojoPago      string   `json:"recojo_pago"`  // completo, adelanto o al_recibir
	MotorizadoPago  string   `json:"motorizado_pago"`
	MotoAdelantoPct int      `json:"motorizado_adelanto_pct"`
	CostoAgencia    int      `json:"costo_agencia_centimos"`
	Otra            bool     `json:"otra"`
	DescripcionOtra string   `json:"descripcion_otra"`
}

const columnas = `id, nombre, slug, rubro, descripcion, ciudad, distrito, logo_key, portada_key, instagram, facebook, tiktok, whatsapp,
	entrega_recojo, direccion_recojo, horario_recojo, entrega_agencia, agencias, entrega_motorizado, costo_motorizado_centimos, zonas_motorizado, reputacion,
	correo, horario, politicas,
	instrucciones_recojo, dias_recojo, adelanto_pct, costo_agencia_centimos, entrega_otra, descripcion_otra, pausada, tema_color, tema_fuente, prefijo_pedido,
	destacado_id, aviso, historia, historia_foto_key, vende_desde,
	yape_numero, plin_numero, pago_titular, pago_qr_key, recojo_pago, motorizado_pago, motorizado_adelanto_pct`

func (m *Modulo) leer(ctx context.Context, where string, arg any) (Tienda, error) {
	var t Tienda
	e := &t.Entrega
	err := m.app.DB.QueryRowContext(ctx, `SELECT `+columnas+` FROM tiendas WHERE `+where, arg).Scan(
		&t.ID, &t.Nombre, &t.Slug, &t.Rubro, &t.Descripcion, &t.Ciudad, &t.Distrito, &t.LogoKey, &t.PortadaKey,
		&t.Instagram, &t.Facebook, &t.Tiktok, &t.Whatsapp,
		&e.Recojo, &e.DireccionRecojo, &e.HorarioRecojo, &e.Agencia, pq.Array(&e.Agencias), &e.Motorizado, &e.CostoMotorizado, &e.ZonasMotorizado, &t.Reputacion,
		&t.Correo, &t.Horario, &t.Politicas,
		&e.Instrucciones, pq.Array(&e.DiasRecojo), &e.AdelantoPct, &e.CostoAgencia, &e.Otra, &e.DescripcionOtra, &t.Pausada, &t.TemaColor, &t.TemaFuente, &t.Prefijo,
		&t.DestacadoID, &t.Aviso, &t.Historia, &t.HistoriaKey, &t.VendeDesde,
		&t.YapeNumero, &t.PlinNumero, &t.PagoTitular, &t.PagoQRKey, &e.RecojoPago, &e.MotorizadoPago, &e.MotoAdelantoPct)
	if core.SinFilas(err) {
		return t, httpx.ErrNoEncontrado
	}
	if err != nil {
		return t, err
	}
	if t.LogoKey != nil {
		t.LogoURL = m.app.Archivos.URLPublica(*t.LogoKey)
	}
	if t.PortadaKey != nil {
		t.PortadaURL = m.app.Archivos.URLPublica(*t.PortadaKey)
	}
	if t.PagoQRKey != nil {
		t.PagoQRURL = m.app.Archivos.URLPublica(*t.PagoQRKey)
	}
	t.MetodosPago = []string{}
	if t.YapeNumero != "" {
		t.MetodosPago = append(t.MetodosPago, "yape_directo")
	}
	if t.PlinNumero != "" {
		t.MetodosPago = append(t.MetodosPago, "plin_directo")
	}
	if t.HistoriaKey != nil {
		t.HistoriaURL = m.app.Archivos.URLPublica(*t.HistoriaKey)
	}
	t.Enlace = m.app.Cfg.WebURL + "/t/" + t.Slug
	return t, nil
}

// ---------- crear ----------

type datosTienda struct {
	Nombre      string  `json:"nombre"`
	Rubro       string  `json:"rubro"`
	Descripcion string  `json:"descripcion"`
	Ciudad      string  `json:"ciudad"`
	Distrito    string  `json:"distrito"`
	Slug        string  `json:"slug"`
	LogoKey     *string `json:"logo_key"`
	PortadaKey  *string `json:"portada_key"`
	Instagram   string  `json:"instagram"`
	Facebook    string  `json:"facebook"`
	Tiktok      string  `json:"tiktok"`
	Whatsapp    string  `json:"whatsapp"`
	Correo      string  `json:"correo"`
	Horario     string  `json:"horario"`
	Politicas   string  `json:"politicas"`
}

func (d *datosTienda) validar() error {
	d.Nombre = strings.TrimSpace(d.Nombre)
	d.Descripcion = strings.TrimSpace(d.Descripcion)
	d.Ciudad = strings.TrimSpace(d.Ciudad)
	d.Distrito = strings.TrimSpace(d.Distrito)
	if len([]rune(d.Nombre)) < 3 || len([]rune(d.Nombre)) > 40 {
		return httpx.Invalido("El nombre de la tienda debe tener entre 3 y 40 caracteres.")
	}
	if !slices.Contains(Rubros, d.Rubro) {
		return httpx.Invalido("Elige el rubro de tu tienda.")
	}
	if d.Ciudad == "" {
		return httpx.Invalido("Indica la ciudad de tu tienda.")
	}
	d.Correo = strings.TrimSpace(d.Correo)
	d.Horario = strings.TrimSpace(d.Horario)
	d.Politicas = strings.TrimSpace(d.Politicas)
	if d.Correo != "" && !regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`).MatchString(d.Correo) {
		return httpx.Invalido("El correo de contacto no es válido.")
	}
	if len([]rune(d.Horario)) > 80 || len([]rune(d.Politicas)) > 600 {
		return httpx.Invalido("El horario o la política de cambios son muy largos.")
	}
	if len([]rune(d.Descripcion)) > 300 {
		return httpx.Invalido("La descripción puede tener hasta 300 caracteres.")
	}
	d.Whatsapp = strings.TrimPrefix(strings.ReplaceAll(d.Whatsapp, " ", ""), "+51")
	if d.Whatsapp != "" && !regexp.MustCompile(`^9\d{8}$`).MatchString(d.Whatsapp) {
		return httpx.Invalido("El WhatsApp debe tener 9 dígitos.")
	}
	for _, red := range []*string{&d.Instagram, &d.Facebook, &d.Tiktok} {
		*red = strings.TrimPrefix(strings.TrimSpace(*red), "@")
	}
	return nil
}

var reSlug = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$`)

// Slug convierte "Luna & Sol" en "luna-sol".
func Slug(s string) string {
	s = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n").Replace(strings.ToLower(s))
	var b strings.Builder
	guion := false
	for _, r := range s {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			guion = false
		default:
			if !guion && b.Len() > 0 {
				b.WriteByte('-')
				guion = true
			}
		}
	}
	out := strings.Trim(b.String(), "-")
	if len(out) > 40 {
		out = strings.Trim(out[:40], "-")
	}
	return out
}

func (m *Modulo) crear(w http.ResponseWriter, r *http.Request) error {
	var in datosTienda
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if err := in.validar(); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(r.Context())
	ctx := r.Context()
	if m.DeUsuario(ctx, u.ID) != nil {
		return httpx.Conflicto("tienda_existe", "Ya tienes una tienda.")
	}
	slug := Slug(in.Slug)
	if slug == "" {
		slug = Slug(in.Nombre)
	}
	if !reSlug.MatchString(slug) {
		return httpx.Invalido("El enlace de la tienda solo puede tener letras, números y guiones.")
	}
	slug = m.slugLibre(ctx, slug)

	var id string
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		err := tx.QueryRowContext(ctx, `INSERT INTO tiendas (usuario_id, nombre, slug, rubro, descripcion, ciudad, distrito, instagram, facebook, tiktok, whatsapp)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
			u.ID, in.Nombre, slug, in.Rubro, in.Descripcion, in.Ciudad, in.Distrito, in.Instagram, in.Facebook, in.Tiktok, in.Whatsapp).Scan(&id)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO suscripciones (tienda_id, plan_id) VALUES ($1, 'gratis')`, id); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE usuarios SET rol='vendedor' WHERE id=$1 AND rol='comprador'`, u.ID)
		return err
	})
	if err != nil {
		return err
	}
	m.app.Auditar(ctx, m.app.DB, u.ID, "crear_tienda", "tienda", id, map[string]string{"slug": slug})
	t, err := m.leer(ctx, "id=$1", id)
	if err != nil {
		return err
	}
	// El rol cambió: el cliente debe renovar su token.
	httpx.JSON(w, http.StatusCreated, map[string]any{"tienda": t, "renovar_sesion": u.Rol != "vendedor"})
	return nil
}

func (m *Modulo) slugLibre(ctx context.Context, base string) string {
	s := base
	for i := 2; i < 100; i++ {
		var existe bool
		m.app.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM tiendas WHERE slug=$1)`, s).Scan(&existe)
		if !existe {
			return s
		}
		s = fmt.Sprintf("%s-%d", base, i)
	}
	return base + "-" + uuid.NewString()[:6]
}

func (m *Modulo) slugDisponible(w http.ResponseWriter, r *http.Request) error {
	s := Slug(r.URL.Query().Get("slug"))
	var existe bool
	m.app.DB.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM tiendas WHERE slug=$1)`, s).Scan(&existe)
	httpx.OK(w, map[string]any{"slug": s, "disponible": reSlug.MatchString(s) && !existe, "sugerido": m.slugLibre(r.Context(), s)})
	return nil
}

// ---------- leer y actualizar ----------

func (m *Modulo) obtener(w http.ResponseWriter, r *http.Request) error {
	id, err := ID(r.Context(), m.app)
	if err != nil {
		return err
	}
	t, err := m.leer(r.Context(), "id=$1", id)
	if err != nil {
		return err
	}
	httpx.OK(w, t)
	return nil
}

func (m *Modulo) validarImagen(ctx context.Context, tiendaID string, key *string, tipo string) error {
	if key == nil || *key == "" {
		return nil
	}
	if !strings.HasPrefix(*key, tipo+"/"+tiendaID+"/") {
		return httpx.Invalido("La imagen no pertenece a tu tienda.")
	}
	return nil
}

func (m *Modulo) actualizar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id, err := ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in datosTienda
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if err := in.validar(); err != nil {
		return err
	}
	if err := m.validarImagen(ctx, id, in.LogoKey, "logo"); err != nil {
		return err
	}
	if err := m.validarImagen(ctx, id, in.PortadaKey, "portada"); err != nil {
		return err
	}
	_, err = m.app.DB.ExecContext(ctx, `UPDATE tiendas SET nombre=$2, rubro=$3, descripcion=$4, ciudad=$5, distrito=$6,
		logo_key=COALESCE(NULLIF($7,''), logo_key), portada_key=COALESCE(NULLIF($8,''), portada_key),
		instagram=$9, facebook=$10, tiktok=$11, whatsapp=$12, correo=$13, horario=$14, horario_recojo=$14, politicas=$15, actualizado_en=now() WHERE id=$1`,
		id, in.Nombre, in.Rubro, in.Descripcion, in.Ciudad, in.Distrito, valor(in.LogoKey), valor(in.PortadaKey),
		in.Instagram, in.Facebook, in.Tiktok, in.Whatsapp, in.Correo, in.Horario, in.Politicas)
	if err != nil {
		return err
	}
	return m.obtener(w, r)
}

func valor(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (m *Modulo) actualizarEntrega(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id, err := ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in Entrega
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.DescripcionOtra = strings.TrimSpace(in.DescripcionOtra)
	in.Instrucciones = strings.TrimSpace(in.Instrucciones)
	if in.Otra && in.DescripcionOtra == "" {
		return httpx.Invalido("Describe cómo entregas en la otra modalidad.")
	}
	// Cómo se paga en recojo y motorizado: lo decide la tienda (siempre Yape o Plin, nunca efectivo).
	opciones := []string{"completo", "adelanto", "al_recibir"}
	if in.RecojoPago == "" {
		in.RecojoPago = "completo"
	}
	if in.MotorizadoPago == "" {
		in.MotorizadoPago = "completo"
	}
	if !slices.Contains(opciones, in.RecojoPago) || !slices.Contains(opciones, in.MotorizadoPago) {
		return httpx.Invalido("Elige cómo te pagan: completo, adelanto o al recibir.")
	}
	if in.RecojoPago != "adelanto" {
		in.AdelantoPct = 0
	}
	if in.MotorizadoPago != "adelanto" {
		in.MotoAdelantoPct = 0
	}
	for _, pct := range []int{in.AdelantoPct, in.MotoAdelantoPct} {
		if !slices.Contains([]int{0, 20, 30, 50}, pct) {
			return httpx.Invalido("El adelanto puede ser 20 %, 30 % o 50 %.")
		}
	}
	if (in.RecojoPago == "adelanto" && in.AdelantoPct == 0) || (in.MotorizadoPago == "adelanto" && in.MotoAdelantoPct == 0) {
		return httpx.Invalido("Elige el porcentaje del adelanto: 20 %, 30 % o 50 %.")
	}
	dias := []int64{}
	for _, d := range in.DiasRecojo {
		if d >= 0 && d <= 6 && !slices.Contains(dias, d) {
			dias = append(dias, d)
		}
	}
	slices.Sort(dias)
	if in.Recojo && len(dias) == 0 {
		return httpx.Invalido("Elige al menos un día en que atiendes.")
	}
	if in.CostoAgencia < 0 || in.CostoAgencia > 20000 {
		return httpx.Invalido("El costo de agencia debe estar entre S/ 0 y S/ 200.")
	}
	if len([]rune(in.Instrucciones)) > 200 || len([]rune(in.DescripcionOtra)) > 200 {
		return httpx.Invalido("Las instrucciones son muy largas.")
	}
	if !in.Recojo && !in.Agencia && !in.Motorizado && !in.Otra {
		return httpx.Invalido("Activa al menos una forma de entrega.")
	}
	in.DireccionRecojo = strings.TrimSpace(in.DireccionRecojo)
	if in.Recojo && in.DireccionRecojo == "" {
		return httpx.Invalido("Escribe la dirección donde tus clientes recogen.")
	}
	if in.Agencia {
		if len(in.Agencias) == 0 {
			return httpx.Invalido("Elige al menos una agencia.")
		}
		for _, a := range in.Agencias {
			if !slices.Contains(Agencias, a) {
				return httpx.Invalido("Agencia no válida: " + a)
			}
		}
	}
	if in.Agencias == nil {
		in.Agencias = []string{}
	}
	if in.CostoMotorizado < 0 || in.CostoMotorizado > 10000 {
		return httpx.Invalido("El costo del motorizado debe estar entre S/ 0 y S/ 100.")
	}
	_, err = m.app.DB.ExecContext(ctx, `UPDATE tiendas SET entrega_recojo=$2, direccion_recojo=$3, horario_recojo=CASE WHEN horario<>'' THEN horario ELSE $4 END, entrega_agencia=$5,
		agencias=$6, entrega_motorizado=$7, costo_motorizado_centimos=$8, zonas_motorizado=$9,
		instrucciones_recojo=$10, dias_recojo=$11, adelanto_pct=$12, costo_agencia_centimos=$13, entrega_otra=$14, descripcion_otra=$15,
		recojo_pago=$16, motorizado_pago=$17, motorizado_adelanto_pct=$18, actualizado_en=now() WHERE id=$1`,
		id, in.Recojo, in.DireccionRecojo, strings.TrimSpace(in.HorarioRecojo), in.Agencia, pq.Array(in.Agencias), in.Motorizado,
		in.CostoMotorizado, strings.TrimSpace(in.ZonasMotorizado),
		in.Instrucciones, pq.Array(dias), in.AdelantoPct, in.CostoAgencia, in.Otra, in.DescripcionOtra,
		in.RecojoPago, in.MotorizadoPago, in.MotoAdelantoPct)
	if err != nil {
		return err
	}
	return m.obtener(w, r)
}

// ---------- vista pública ----------

func (m *Modulo) publica(w http.ResponseWriter, r *http.Request) error {
	t, err := m.leer(r.Context(), "slug=$1 AND activa", chi.URLParam(r, "slug"))
	if err != nil {
		return err
	}
	// El WhatsApp y el correo son solo para que VendiGo avise a la tienda: no se muestran a los compradores.
	// Los datos de Yape/Plin se muestran recién en el seguimiento del pedido, al momento de pagar.
	t.Whatsapp, t.Correo = "", ""
	t.YapeNumero, t.PlinNumero, t.PagoTitular, t.PagoQRKey, t.PagoQRURL = "", "", "", nil, ""
	httpx.OK(w, t)
	return nil
}

// registrarVisita suma una visita del día a la tienda o a uno de sus productos (para "Rendimiento" y sugerencias).
func (m *Modulo) registrarVisita(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		ProductoID string `json:"producto_id"`
	}
	if r.ContentLength > 0 {
		if err := httpx.Leer(r, &in); err != nil {
			return err
		}
	}
	var prod any
	if in.ProductoID != "" {
		prod = in.ProductoID
	}
	_, err := m.app.DB.ExecContext(r.Context(), `INSERT INTO visitas (tienda_id, producto_id, cantidad)
		SELECT t.id, p.id, 1 FROM tiendas t
		LEFT JOIN productos p ON p.tienda_id=t.id AND p.id::text=$2 AND NOT p.eliminado
		WHERE t.slug=$1 AND t.activa AND ($2::text IS NULL OR p.id IS NOT NULL)
		ON CONFLICT (tienda_id, (COALESCE(producto_id, '00000000-0000-0000-0000-000000000000'::uuid)), dia)
		DO UPDATE SET cantidad = visitas.cantidad + 1`, chi.URLParam(r, "slug"), prod)
	if err != nil {
		return err
	}
	w.WriteHeader(http.StatusNoContent)
	return nil
}

func (m *Modulo) catalogos(w http.ResponseWriter, r *http.Request) error {
	httpx.OK(w, map[string]any{"rubros": Rubros, "agencias": Agencias})
	return nil
}

// ---------- subida de imágenes ----------

var tiposArchivo = map[string]bool{"producto": true, "logo": true, "portada": true, "historia": true, "pago_qr": true, "devolucion": false, "boleta": false, "dni": false, "reclamo": false}
var formatos = map[string]string{"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}

const tamanoMaximo = 5 << 20

type subidaReq struct {
	Tipo        string `json:"tipo"`
	ContentType string `json:"content_type"`
	Tamano      int64  `json:"tamano"`
}

func (m *Modulo) pedirSubida(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id, err := ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in subidaReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	publico, ok := tiposArchivo[in.Tipo]
	if !ok {
		return httpx.Invalido("Tipo de archivo no válido.")
	}
	ext, ok := formatos[in.ContentType]
	if !ok {
		return httpx.Invalido("Sube una imagen JPG, PNG o WEBP.")
	}
	if in.Tamano <= 0 || in.Tamano > tamanoMaximo {
		return httpx.Invalido("La imagen debe pesar menos de 5 MB.")
	}
	key := fmt.Sprintf("%s/%s/%s.%s", in.Tipo, id, uuid.NewString(), ext)
	url, err := m.app.Archivos.URLSubida(ctx, publico, key, in.ContentType, in.Tamano)
	if err != nil {
		return err
	}
	resp := map[string]any{"key": key, "url_subida": url, "metodo": "PUT", "vence_en_segundos": 300}
	if publico {
		resp["url_publica"] = m.app.Archivos.URLPublica(key)
	}
	httpx.OK(w, resp)
	return nil
}

// ---------- ajustes (Configuración) ----------

// Ajustes son las opciones de Configuración que viven en la tienda:
// RUC para comprobantes, pausar la tienda y qué avisos quiere recibir.
type Ajustes struct {
	RUC     string          `json:"ruc"`
	Pausada bool            `json:"pausada"`
	Avisos  map[string]bool `json:"avisos"`
}

func (m *Modulo) ajustes(w http.ResponseWriter, r *http.Request) error {
	id, err := ID(r.Context(), m.app)
	if err != nil {
		return err
	}
	var a Ajustes
	var avisos []byte
	if err := m.app.DB.QueryRowContext(r.Context(), `SELECT ruc, pausada, avisos FROM tiendas WHERE id=$1`, id).Scan(&a.RUC, &a.Pausada, &avisos); err != nil {
		return err
	}
	a.Avisos = map[string]bool{"pedidos": true, "consultas": true, "inventario": true}
	var guardados map[string]bool
	if json.Unmarshal(avisos, &guardados) == nil {
		for k, v := range guardados {
			if _, ok := a.Avisos[k]; ok {
				a.Avisos[k] = v
			}
		}
	}
	httpx.OK(w, a)
	return nil
}

var reRUC = regexp.MustCompile(`^(10|15|17|20)\d{9}$`)

func (m *Modulo) guardarAjustes(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id, err := ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		RUC     *string         `json:"ruc"`
		Pausada *bool           `json:"pausada"`
		Avisos  map[string]bool `json:"avisos"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if in.RUC != nil {
		ruc := strings.TrimSpace(*in.RUC)
		if ruc != "" && !reRUC.MatchString(ruc) {
			return httpx.Invalido("El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.")
		}
		if _, err := m.app.DB.ExecContext(ctx, `UPDATE tiendas SET ruc=$2, actualizado_en=now() WHERE id=$1`, id, ruc); err != nil {
			return err
		}
	}
	if in.Pausada != nil {
		if _, err := m.app.DB.ExecContext(ctx, `UPDATE tiendas SET pausada=$2, actualizado_en=now() WHERE id=$1`, id, *in.Pausada); err != nil {
			return err
		}
	}
	if in.Avisos != nil {
		limpio := map[string]bool{}
		for _, k := range []string{"pedidos", "consultas", "inventario"} {
			v, ok := in.Avisos[k]
			limpio[k] = !ok || v
		}
		b, _ := json.Marshal(limpio)
		if _, err := m.app.DB.ExecContext(ctx, `UPDATE tiendas SET avisos=$2, actualizado_en=now() WHERE id=$1`, id, b); err != nil {
			return err
		}
	}
	return m.ajustes(w, r)
}
