package billetera

// Este paquete ya no maneja dinero: VendiGo no recibe ni retiene los pagos de las ventas.
// Queda la verificación de la vendedora, los avisos a la tienda y el cálculo de días hábiles.
// La verificación tiene dos partes, que aprueba un administrador:
//   · identidad (DNI o carné de extranjería, con selfie): obligatoria; sin ella la tienda no se muestra a los compradores.
//   · negocio (RUC con su ficha RUC): opcional; da la insignia "Negocio con RUC verificado".

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

func (m *Modulo) estadoVerificacion(r *http.Request, tid, clase string) string {
	var e string
	if m.app.DB.QueryRowContext(r.Context(), `SELECT estado FROM verificaciones WHERE tienda_id=$1 AND clase=$2 ORDER BY creado_en DESC LIMIT 1`, tid, clase).Scan(&e) != nil {
		return "sin_enviar"
	}
	return e
}

type estadoVerif struct {
	Estado   string     `json:"estado"`
	Tipo     string     `json:"tipo_documento,omitempty"`
	Ultimos4 string     `json:"ultimos4,omitempty"`
	Nombre   string     `json:"nombre_completo,omitempty"`
	Motivo   string     `json:"motivo_rechazo,omitempty"`
	CreadoEn *time.Time `json:"creado_en,omitempty"`
}

func (m *Modulo) leerVerif(r *http.Request, tid, clase string) (estadoVerif, error) {
	v := estadoVerif{}
	var creado time.Time
	err := m.app.DB.QueryRowContext(r.Context(), `SELECT estado, tipo_documento, ultimos4, nombre_completo, motivo_rechazo, creado_en
		FROM verificaciones WHERE tienda_id=$1 AND clase=$2 ORDER BY creado_en DESC LIMIT 1`, tid, clase).Scan(&v.Estado, &v.Tipo, &v.Ultimos4, &v.Nombre, &v.Motivo, &creado)
	if core.SinFilas(err) {
		return estadoVerif{Estado: "sin_enviar"}, nil
	}
	if err != nil {
		return v, err
	}
	v.CreadoEn = &creado
	return v, nil
}

func (m *Modulo) verificacion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	// La identidad va en la raíz (como antes) y el RUC en "negocio".
	identidad, err := m.leerVerif(r, tid, "identidad")
	if err != nil {
		return err
	}
	negocio, err := m.leerVerif(r, tid, "negocio")
	if err != nil {
		return err
	}
	httpx.OK(w, struct {
		estadoVerif
		Negocio estadoVerif `json:"negocio"`
	}{identidad, negocio})
	return nil
}

// rucValido comprueba el dígito verificador del RUC (SUNAT, módulo 11).
func rucValido(ruc string) bool {
	if !regexp.MustCompile(`^(10|15|17|20)\d{9}$`).MatchString(ruc) {
		return false
	}
	pesos := []int{5, 4, 3, 2, 7, 6, 5, 4, 3, 2}
	suma := 0
	for i, p := range pesos {
		suma += int(ruc[i]-'0') * p
	}
	d := 11 - suma%11
	if d >= 10 {
		d -= 10
	}
	return d == int(ruc[10]-'0')
}

var reDoc = map[string]*regexp.Regexp{"dni": regexp.MustCompile(`^\d{8}$`), "ruc": regexp.MustCompile(`^(10|15|17|20)\d{9}$`), "ce": regexp.MustCompile(`^\d{9,12}$`)}

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
	clase := "identidad"
	if in.Tipo == "ruc" {
		clase = "negocio"
	}
	pref := "dni/" + tid + "/"
	if clase == "negocio" {
		// RUC: el número (con su dígito verificador), la razón social y la foto o PDF de la ficha RUC.
		if !rucValido(in.Numero) {
			return httpx.Invalido("El RUC no es válido. Revisa los 11 dígitos.")
		}
		if len([]rune(strings.TrimSpace(in.Nombre))) < 3 {
			return httpx.Invalido("Escribe la razón social o el nombre como figura en tu ficha RUC.")
		}
		if !strings.HasPrefix(in.FrenteKey, pref) {
			return httpx.Invalido("Sube la foto de tu ficha RUC.")
		}
		in.ReversoKey, in.SelfieKey = "", ""
	} else {
		if !re.MatchString(in.Numero) {
			return httpx.Invalido("El número de documento no es válido.")
		}
		if len([]rune(strings.TrimSpace(in.Nombre))) < 5 {
			return httpx.Invalido("Escribe tu nombre completo como figura en tu documento.")
		}
		if !strings.HasPrefix(in.FrenteKey, pref) || !strings.HasPrefix(in.SelfieKey, pref) || (in.ReversoKey != "" && !strings.HasPrefix(in.ReversoKey, pref)) {
			return httpx.Invalido("Sube las fotos del documento y tu selfie.")
		}
	}
	if e := m.estadoVerificacion(r, tid, clase); e == "pendiente" || e == "aprobada" {
		if clase == "negocio" {
			return httpx.Conflicto("verificacion_existe", "Tu RUC ya fue enviado.")
		}
		return httpx.Conflicto("verificacion_existe", "Tu verificación ya fue enviada.")
	}
	num, err := m.app.Cifrador.Cifrar(in.Numero)
	if err != nil {
		return err
	}
	var reverso, selfie any
	if in.ReversoKey != "" {
		reverso = in.ReversoKey
	}
	if in.SelfieKey != "" {
		selfie = in.SelfieKey
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO verificaciones (tienda_id, tipo_documento, numero_cifrado, ultimos4, nombre_completo, frente_key, reverso_key, selfie_key, clase)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, tid, in.Tipo, num, in.Numero[len(in.Numero)-4:], strings.TrimSpace(in.Nombre), in.FrenteKey, reverso, selfie, clase); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(ctx)
	m.app.Auditar(ctx, m.app.DB, u.ID, "enviar_verificacion", "tienda", tid, nil)
	return m.verificacion(w, r)
}
