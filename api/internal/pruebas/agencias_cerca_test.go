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

// "Buscar la Shalom más cercana a mí" consulta el buscador de OpenStreetMap (aquí un servidor falso, sin internet):
// deja fuera lo que no es agencia (una iglesia o una calle "Shalom"), ordena por cercanía y no repite la consulta para la misma zona.
func TestAgenciasRealesCerca(t *testing.T) {
	necesitaBase(t)
	consultas := 0
	var agente, consulta string
	falso := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		consultas++
		agente = r.Header.Get("User-Agent")
		consulta = r.URL.RawQuery
		w.Write([]byte(`[
			{"lat":"-12.1500","lon":"-77.0200","name":"Shalom Barranco","category":"office","type":"courier","address":{"road":"Av. Grau","house_number":"300","suburb":"Barranco","city":"Lima"}},
			{"lat":"-12.0710","lon":"-77.0470","name":"Shalom Jesús María","category":"shop","type":"courier","address":{}},
			{"lat":"-12.0720","lon":"-77.0480","name":"Iglesia Shalom","category":"amenity","type":"place_of_worship","address":{}},
			{"lat":"-12.0730","lon":"-77.0490","name":"Pasaje Shalom","category":"highway","type":"residential","address":{}}
		]`))
	}))
	defer falso.Close()
	antes, buscador, respaldo := tiendas.URLOverpass, tiendas.URLBuscador, tiendas.OverpassRespaldo
	tiendas.URLBuscador, tiendas.URLOverpass, tiendas.OverpassRespaldo = falso.URL, "http://127.0.0.1:1", nil
	defer func() { tiendas.URLOverpass, tiendas.URLBuscador, tiendas.OverpassRespaldo = antes, buscador, respaldo }()

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
		t.Fatalf("la iglesia y la calle no son agencias: se esperaban 2, salieron %+v", lista)
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
	if strings.Contains(consulta, "12.07123") || !strings.Contains(consulta, "bounded=1") {
		t.Fatalf("la ubicación debe ir redondeada (~1 km) y limitada a la zona: %s", consulta)
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
