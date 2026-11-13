package pruebas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// "Buscar la Shalom más cercana a mí" consulta OpenStreetMap (aquí un servidor falso, sin internet):
// deja fuera lo que no es agencia (una iglesia "Shalom"), ordena por cercanía y no repite la consulta para la misma zona.
func TestAgenciasRealesCerca(t *testing.T) {
	necesitaBase(t)
	consultas := 0
	var agente, cuerpo string
	falso := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		consultas++
		agente = r.Header.Get("User-Agent")
		r.ParseForm()
		cuerpo = r.Form.Get("data")
		w.Write([]byte(`{"elements":[
			{"type":"node","lat":-12.1500,"lon":-77.0200,"tags":{"name":"Shalom Barranco","office":"courier","addr:street":"Av. Grau","addr:housenumber":"300","addr:district":"Barranco","addr:city":"Lima"}},
			{"type":"node","lat":-12.0710,"lon":-77.0470,"tags":{"name":"Shalom Jesús María","shop":"courier"}},
			{"type":"way","center":{"lat":-12.0720,"lon":-77.0480},"tags":{"name":"Iglesia Shalom","amenity":"place_of_worship"}}
		]}`))
	}))
	defer falso.Close()
	antes := tiendas.URLOverpass
	tiendas.URLOverpass = falso.URL
	defer func() { tiendas.URLOverpass = antes }()

	rt := chi.NewRouter()
	tiendas.Nuevo(app).RutasPublicas(rt)
	pedir := func(lat, lng string) []tiendas.AgenciaCerca {
		rec := httptest.NewRecorder()
		rt.ServeHTTP(rec, httptest.NewRequest("GET", "/agencias/cerca?agencia=Shalom&lat="+lat+"&lng="+lng, nil))
		if rec.Code != 200 {
			t.Fatalf("respondió %d: %s", rec.Code, rec.Body.String())
		}
		var r struct {
			Agencias   []tiendas.AgenciaCerca `json:"agencias"`
			Disponible bool                   `json:"disponible"`
		}
		json.Unmarshal(rec.Body.Bytes(), &r)
		if !r.Disponible {
			t.Fatal("la búsqueda debía estar disponible")
		}
		return r.Agencias
	}

	// Comprador en Jesús María (coordenadas con más decimales de los que se usan).
	lista := pedir("-12.07123", "-77.04789")
	if len(lista) != 2 {
		t.Fatalf("la iglesia no es una agencia: se esperaban 2, salieron %+v", lista)
	}
	if lista[0].Nombre != "Shalom Jesús María" || lista[1].Nombre != "Shalom Barranco" {
		t.Fatalf("deben ir de la más cercana a la más lejana: %+v", lista)
	}
	if lista[1].Direccion != "Av. Grau 300, Barranco" || lista[1].Ciudad != "Lima" {
		t.Fatalf("dirección armada mal: %+v", lista[1])
	}
	if !strings.HasPrefix(agente, "VendiGo/") {
		t.Fatalf("OpenStreetMap pide identificar la aplicación; se envió %q", agente)
	}
	if strings.Contains(cuerpo, "-12.07123") || !strings.Contains(cuerpo, "-12.07") {
		t.Fatalf("la ubicación debe ir redondeada (~1 km), no exacta: %s", cuerpo)
	}
	// Otro comprador en la misma zona: sale de lo guardado, sin otra consulta al mapa.
	pedir("-12.0749", "-77.0451")
	if consultas != 1 {
		t.Fatalf("la misma zona no debe consultar otra vez (consultas: %d)", consultas)
	}
	// Fuera del Perú no se busca.
	rec := httptest.NewRecorder()
	rt.ServeHTTP(rec, httptest.NewRequest("GET", "/agencias/cerca?agencia=Shalom&lat=40.4&lng=-3.7", nil))
	if rec.Code != 400 && rec.Code != 422 {
		t.Fatalf("fuera del Perú debe rechazarse, respondió %d", rec.Code)
	}
}
