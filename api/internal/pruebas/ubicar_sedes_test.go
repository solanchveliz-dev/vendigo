package pruebas

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/admin"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// "Ubicar automáticamente" consulta OpenStreetMap identificándose como VendiGo y guarda el punto marcado
// para revisar. Se usa un servidor falso: las pruebas no salen a internet.
func TestUbicarSedesDesdeLaDireccion(t *testing.T) {
	necesitaBase(t)
	var agente string
	falso := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		agente = r.Header.Get("User-Agent")
		if strings.Contains(r.URL.Query().Get("q"), "Calle Inventada") {
			w.Write([]byte(`[]`))
			return
		}
		w.Write([]byte(`[{"lat":"-12.0705","lon":"-77.0462"}]`))
	}))
	defer falso.Close()
	antes := admin.URLNominatim
	admin.URLNominatim = falso.URL
	defer func() { admin.URLNominatim = antes }()

	n := siguiente()
	encontrable := "Sede ubicable " + strings.Repeat("x", n%5+1)
	if _, err := base.Exec(`INSERT INTO agencias_sedes (agencia, ciudad, nombre, direccion) VALUES
		('PruebaMapa', 'Lima', $1, 'Av. Brasil 1250, Jesús María'),
		('PruebaMapa', 'Lima', $2, 'Calle Inventada 1')`, encontrable, encontrable+" b"); err != nil {
		t.Fatal(err)
	}

	rt := chi.NewRouter()
	admin.Nuevo(app).Rutas(rt)
	req := httptest.NewRequest("POST", "/agencias/ubicar?agencia=PruebaMapa", nil)
	req = req.WithContext(httpx.ConUsuario(req.Context(), httpx.Usuario{ID: crearUsuario(t, "admin"), Rol: "admin"}))
	rec := httptest.NewRecorder()
	rt.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatalf("respondió %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.HasPrefix(agente, "VendiGo/") {
		t.Fatalf("OpenStreetMap pide identificar la aplicación; se envió %q", agente)
	}
	var lat float64
	var auto bool
	if err := base.QueryRow(`SELECT lat, ubicacion_auto FROM agencias_sedes WHERE nombre=$1`, encontrable).Scan(&lat, &auto); err != nil {
		t.Fatal(err)
	}
	if lat != -12.0705 || !auto {
		t.Fatalf("la sede debe quedar ubicada y marcada para revisar (lat %v, auto %v)", lat, auto)
	}
	var sinUbicar bool
	base.QueryRow(`SELECT lat IS NULL FROM agencias_sedes WHERE nombre=$1`, encontrable+" b").Scan(&sinUbicar)
	if !sinUbicar {
		t.Fatal("una dirección que no se encuentra debe quedar sin ubicación, no inventada")
	}
}
