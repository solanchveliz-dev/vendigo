package billetera

// Este paquete ya no maneja dinero: VendiGo no recibe ni retiene los pagos de las ventas.
// Queda la verificación de identidad de la vendedora (insignia "Tienda verificada"),
// los avisos a la tienda y el cálculo de días hábiles.

import (
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

type Modulo struct {
	app *core.App
}

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

func (m *Modulo) RutasVendedor(r chi.Router) {
	r.Method("GET", "/verificacion", httpx.Handler(m.verificacion))
	r.Method("POST", "/verificacion", httpx.Handler(m.enviarVerificacion))
}

// ---------- verificación de identidad ----------

func (m *Modulo) estadoVerificacion(r *http.Request, tid string) string {
	var e string
	if m.app.DB.QueryRowContext(r.Context(), `SELECT estado FROM verificaciones WHERE tienda_id=$1 ORDER BY creado_en DESC LIMIT 1`, tid).Scan(&e) != nil {
		return "sin_enviar"
	}
	return e
}

func (m *Modulo) verificacion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var v struct {
		Estado   string    `json:"estado"`
		Tipo     string    `json:"tipo_documento"`
		Ultimos4 string    `json:"ultimos4"`
		Nombre   string    `json:"nombre_completo"`
		Motivo   string    `json:"motivo_rechazo"`
		CreadoEn time.Time `json:"creado_en"`
	}
	err = m.app.DB.QueryRowContext(ctx, `SELECT estado, tipo_documento, ultimos4, nombre_completo, motivo_rechazo, creado_en
		FROM verificaciones WHERE tienda_id=$1 ORDER BY creado_en DESC LIMIT 1`, tid).Scan(&v.Estado, &v.Tipo, &v.Ultimos4, &v.Nombre, &v.Motivo, &v.CreadoEn)
	if core.SinFilas(err) {
		httpx.OK(w, map[string]any{"estado": "sin_enviar"})
		return nil
	}
	if err != nil {
		return err
	}
	httpx.OK(w, v)
	return nil
}

var reDoc = map[string]*regexp.Regexp{"dni": regexp.MustCompile(`^\d{8}$`), "ruc": regexp.MustCompile(`^(10|20)\d{9}$`), "ce": regexp.MustCompile(`^\d{9,12}$`)}

func (m *Modulo) enviarVerificacion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Tipo       string `json:"tipo_documento"`
		Numero     string `json:"numero"`
		Nombre     string `json:"nombre_completo"`
		FrenteKey  string `json:"frente_key"`
		ReversoKey string `json:"reverso_key"`
		SelfieKey  string `json:"selfie_key"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	re, ok := reDoc[in.Tipo]
	if !ok {
		return httpx.Invalido("Elige el tipo de documento.")
	}
	in.Numero = strings.TrimSpace(in.Numero)
	if !re.MatchString(in.Numero) {
		return httpx.Invalido("El número de documento no es válido.")
	}
	if len([]rune(strings.TrimSpace(in.Nombre))) < 5 {
		return httpx.Invalido("Escribe tu nombre completo como figura en tu documento.")
	}
	pref := "dni/" + tid + "/"
	if !strings.HasPrefix(in.FrenteKey, pref) || !strings.HasPrefix(in.SelfieKey, pref) || (in.ReversoKey != "" && !strings.HasPrefix(in.ReversoKey, pref)) {
		return httpx.Invalido("Sube las fotos del documento y tu selfie.")
	}
	if m.estadoVerificacion(r, tid) == "pendiente" || m.estadoVerificacion(r, tid) == "aprobada" {
		return httpx.Conflicto("verificacion_existe", "Tu verificación ya fue enviada.")
	}
	num, err := m.app.Cifrador.Cifrar(in.Numero)
	if err != nil {
		return err
	}
	var reverso any
	if in.ReversoKey != "" {
		reverso = in.ReversoKey
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO verificaciones (tienda_id, tipo_documento, numero_cifrado, ultimos4, nombre_completo, frente_key, reverso_key, selfie_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, tid, in.Tipo, num, in.Numero[len(in.Numero)-4:], strings.TrimSpace(in.Nombre), in.FrenteKey, reverso, in.SelfieKey); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(ctx)
	m.app.Auditar(ctx, m.app.DB, u.ID, "enviar_verificacion", "tienda", tid, nil)
	return m.verificacion(w, r)
}
