// Package libro implementa el Libro de Reclamaciones virtual de VendiGo y los datos legales del proveedor.
package libro

import (
	"database/sql"
	"net/http"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
)

type Modulo struct{ app *core.App }

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

// RutasPublicas: cualquier persona puede registrar una hoja (sin cuenta, como exige la norma).
func (m *Modulo) RutasPublicas(r chi.Router) {
	r.Method("GET", "/legal/proveedor", httpx.Handler(m.proveedor))
	r.Method("POST", "/libro-reclamaciones", httpx.Handler(m.registrar))
}

// RutasAdmin se montan dentro de /admin.
func (m *Modulo) RutasAdmin(r chi.Router) {
	r.Method("GET", "/libro", httpx.Handler(m.listar))
	r.Method("POST", "/libro/{n}/responder", httpx.Handler(m.responder))
	r.Method("PUT", "/legal/proveedor", httpx.Handler(m.guardarProveedor))
}

type Proveedor struct {
	RazonSocial string `json:"razon_social"`
	RUC         string `json:"ruc"`
	Direccion   string `json:"direccion_fiscal"`
	Correo      string `json:"correo_soporte"`
}

func (m *Modulo) leerProveedor(q core.Ejecutor, r *http.Request) Proveedor {
	p := Proveedor{Correo: "ayuda@vendigo.pe"}
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT clave, valor FROM ajustes_plataforma WHERE clave IN ('razon_social','ruc','direccion_fiscal','correo_soporte')`)
	if err != nil {
		return p
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v)
		switch k {
		case "razon_social":
			p.RazonSocial = v
		case "ruc":
			p.RUC = v
		case "direccion_fiscal":
			p.Direccion = v
		case "correo_soporte":
			p.Correo = v
		}
	}
	return p
}

// proveedor: datos legales de VendiGo y las reglas vigentes del fondo de emergencia
// (las páginas de Términos y Devoluciones las muestran tal como las configura el admin).
func (m *Modulo) proveedor(w http.ResponseWriter, r *http.Request) error {
	httpx.OK(w, struct {
		Proveedor
		Fondo pagos.Garantia `json:"fondo"`
	}{m.leerProveedor(m.app.DB, r), pagos.LeerGarantia(r.Context(), m.app.DB)})
	return nil
}

var reRUC = regexp.MustCompile(`^(10|15|17|20)\d{9}$`)

func (m *Modulo) guardarProveedor(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in Proveedor
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.RazonSocial, in.RUC, in.Direccion = strings.TrimSpace(in.RazonSocial), strings.TrimSpace(in.RUC), strings.TrimSpace(in.Direccion)
	switch {
	case len([]rune(in.RazonSocial)) < 3 || len([]rune(in.RazonSocial)) > 150:
		return httpx.Invalido("Escribe la razón social o el nombre del titular del RUC.")
	case !reRUC.MatchString(in.RUC):
		return httpx.Invalido("El RUC debe tener 11 dígitos y empezar con 10, 15, 17 o 20.")
	case len([]rune(in.Direccion)) < 5 || len([]rune(in.Direccion)) > 200:
		return httpx.Invalido("Escribe la dirección fiscal.")
	}
	u, _ := httpx.UsuarioDe(ctx)
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		for k, v := range map[string]string{"razon_social": in.RazonSocial, "ruc": in.RUC, "direccion_fiscal": in.Direccion} {
			if _, err := tx.ExecContext(ctx, `INSERT INTO ajustes_plataforma (clave, valor) VALUES ($1,$2)
				ON CONFLICT (clave) DO UPDATE SET valor=$2, actualizado_en=now()`, k, v); err != nil {
				return err
			}
		}
		m.app.Auditar(ctx, tx, u.ID, "editar_configuracion", "ajustes", "proveedor", map[string]string{"ruc": in.RUC})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Datos del proveedor guardados."})
	return nil
}

// VenceEn suma 15 días hábiles (sin sábados, domingos ni feriados de Perú) a la fecha de registro.
func VenceEn(desde time.Time) time.Time {
	lima, _ := time.LoadLocation("America/Lima")
	d := desde.In(lima)
	for n := 0; n < 15; {
		d = d.AddDate(0, 0, 1)
		if billetera.EsDiaHabil(d) {
			n++
		}
	}
	return time.Date(d.Year(), d.Month(), d.Day(), 23, 59, 59, 0, lima)
}

type Hoja struct {
	Numero           int64      `json:"numero"`
	Nombre           string     `json:"nombre"`
	DocumentoTipo    string     `json:"documento_tipo"`
	Documento        string     `json:"documento"`
	Domicilio        string     `json:"domicilio"`
	Telefono         string     `json:"telefono"`
	Email            string     `json:"email"`
	Apoderado        string     `json:"apoderado"`
	BienTipo         string     `json:"bien_tipo"`
	Monto            *int       `json:"monto_centimos"`
	DescripcionBien  string     `json:"descripcion_bien"`
	PedidoCodigo     string     `json:"pedido_codigo"`
	Tienda           string     `json:"tienda"`
	Tipo             string     `json:"tipo"`
	Detalle          string     `json:"detalle"`
	PedidoConsumidor string     `json:"pedido_consumidor"`
	Respuesta        string     `json:"respuesta"`
	RespondidaEn     *time.Time `json:"respondida_en"`
	VenceEn          time.Time  `json:"vence_en"`
	CreadoEn         time.Time  `json:"creado_en"`
}

var reDoc = map[string]*regexp.Regexp{"DNI": regexp.MustCompile(`^\d{8}$`), "CE": regexp.MustCompile(`^[A-Za-z0-9]{8,12}$`), "Pasaporte": regexp.MustCompile(`^[A-Za-z0-9]{6,12}$`)}

func limpio(s string, min, max int) (string, bool) {
	s = strings.TrimSpace(s)
	n := len([]rune(s))
	return s, n >= min && n <= max
}

func (m *Modulo) registrar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var h Hoja
	if err := httpx.Leer(r, &h); err != nil {
		return err
	}
	var ok bool
	if h.Nombre, ok = limpio(h.Nombre, 3, 120); !ok {
		return httpx.Invalido("Escribe tu nombre completo.")
	}
	re := reDoc[h.DocumentoTipo]
	if h.Documento = strings.TrimSpace(h.Documento); re == nil || !re.MatchString(h.Documento) {
		return httpx.Invalido("Revisa tu tipo y número de documento.")
	}
	if h.Domicilio, ok = limpio(h.Domicilio, 5, 200); !ok {
		return httpx.Invalido("Escribe tu domicilio.")
	}
	if h.Telefono, ok = limpio(h.Telefono, 6, 20); !ok {
		return httpx.Invalido("Escribe un teléfono de contacto.")
	}
	h.Email = strings.ToLower(strings.TrimSpace(h.Email))
	if a, err := mail.ParseAddress(h.Email); err != nil || a.Address != h.Email {
		return httpx.Invalido("Escribe un correo válido: ahí te enviaremos la respuesta.")
	}
	h.Apoderado, _ = limpio(h.Apoderado, 0, 120)
	if h.BienTipo != "producto" && h.BienTipo != "servicio" {
		return httpx.Invalido("Indica si es un producto o un servicio.")
	}
	if h.Monto != nil && (*h.Monto < 0 || *h.Monto > 100000000) {
		return httpx.Invalido("El monto no es válido.")
	}
	if h.DescripcionBien, ok = limpio(h.DescripcionBien, 3, 300); !ok {
		return httpx.Invalido("Describe el producto o servicio.")
	}
	h.PedidoCodigo, _ = limpio(strings.ToUpper(h.PedidoCodigo), 0, 30)
	h.Tienda, _ = limpio(h.Tienda, 0, 120)
	if h.Tipo != "reclamo" && h.Tipo != "queja" {
		return httpx.Invalido("Elige si es un reclamo o una queja.")
	}
	if h.Detalle, ok = limpio(h.Detalle, 10, 3000); !ok {
		return httpx.Invalido("Cuéntanos el detalle (mínimo 10 caracteres).")
	}
	if h.PedidoConsumidor, ok = limpio(h.PedidoConsumidor, 3, 1000); !ok {
		return httpx.Invalido("Escribe qué solicitas.")
	}
	ahora := time.Now()
	h.VenceEn, h.CreadoEn = VenceEn(ahora), ahora
	err := m.app.DB.QueryRowContext(ctx, `INSERT INTO hojas_reclamacion (nombre, documento_tipo, documento, domicilio, telefono, email, apoderado,
		bien_tipo, monto_centimos, descripcion_bien, pedido_codigo, tienda, tipo, detalle, pedido_consumidor, vence_en, ip, creado_en)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING numero`,
		h.Nombre, h.DocumentoTipo, h.Documento, h.Domicilio, h.Telefono, h.Email, h.Apoderado, h.BienTipo, h.Monto, h.DescripcionBien,
		h.PedidoCodigo, h.Tienda, h.Tipo, h.Detalle, h.PedidoConsumidor, h.VenceEn, httpx.IP(r), ahora).Scan(&h.Numero)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"hoja": h, "proveedor": m.leerProveedor(m.app.DB, r)})
	return nil
}

func (m *Modulo) listar(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT numero, nombre, documento_tipo, documento, domicilio, telefono, email, apoderado, bien_tipo,
		monto_centimos, descripcion_bien, pedido_codigo, tienda, tipo, detalle, pedido_consumidor, respuesta, respondida_en, vence_en, creado_en
		FROM hojas_reclamacion ORDER BY respondida_en IS NOT NULL, vence_en LIMIT 5000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Hoja{}
	for rows.Next() {
		var h Hoja
		if err := rows.Scan(&h.Numero, &h.Nombre, &h.DocumentoTipo, &h.Documento, &h.Domicilio, &h.Telefono, &h.Email, &h.Apoderado, &h.BienTipo,
			&h.Monto, &h.DescripcionBien, &h.PedidoCodigo, &h.Tienda, &h.Tipo, &h.Detalle, &h.PedidoConsumidor, &h.Respuesta, &h.RespondidaEn, &h.VenceEn, &h.CreadoEn); err != nil {
			return err
		}
		out = append(out, h)
	}
	httpx.OK(w, map[string]any{"hojas": out})
	return nil
}

func (m *Modulo) responder(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Respuesta string `json:"respuesta"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	resp, ok := limpio(in.Respuesta, 10, 3000)
	if !ok {
		return httpx.Invalido("Escribe la respuesta (mínimo 10 caracteres).")
	}
	u, _ := httpx.UsuarioDe(ctx)
	res, err := m.app.DB.ExecContext(ctx, `UPDATE hojas_reclamacion SET respuesta=$2, respondida_en=now(), respondida_por=$3
		WHERE numero::text=$1 AND respondida_en IS NULL`, chi.URLParam(r, "n"), resp, u.ID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.Conflicto("ya_respondida", "Esta hoja ya fue respondida.")
	}
	m.app.Auditar(ctx, m.app.DB, u.ID, "responder_libro", "hoja_reclamacion", chi.URLParam(r, "n"), nil)
	httpx.OK(w, map[string]string{"mensaje": "Respuesta registrada. Envíala al correo del consumidor."})
	return nil
}
