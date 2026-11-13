package pruebas

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// El checkout lista solo las sedes activas de la agencia pedida, con su ubicación para ordenarlas por cercanía.
func TestSedesPublicasSoloActivas(t *testing.T) {
	necesitaBase(t)
	n := siguiente()
	agencia := "AgenciaPrueba" + string(rune('A'+n%26))
	if _, err := base.Exec(`INSERT INTO agencias_sedes (agencia, ciudad, nombre, direccion, lat, lng) VALUES
		($1, 'Lima', 'Sede abierta', 'Av. Uno 100', -12.1, -77.0),
		($1, 'Lima', 'Sede cerrada', 'Av. Dos 200', NULL, NULL)`, agencia); err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`UPDATE agencias_sedes SET activa=false WHERE agencia=$1 AND nombre='Sede cerrada'`, agencia); err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`INSERT INTO agencias_sedes (agencia, ciudad, nombre, direccion, lat, lng) VALUES ($1, 'Madrid', 'Fuera', 'Calle 1', 40.4, -3.7)`, agencia); err == nil {
		t.Fatal("una ubicación fuera del Perú no debe guardarse")
	}

	rt := chi.NewRouter()
	tiendas.Nuevo(app).RutasPublicas(rt)
	rec := httptest.NewRecorder()
	rt.ServeHTTP(rec, httptest.NewRequest("GET", "/agencias/sedes?agencia="+agencia, nil))
	if rec.Code != 200 {
		t.Fatalf("respondió %d", rec.Code)
	}
	var r struct {
		Sedes []tiendas.SedePublica `json:"sedes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &r); err != nil {
		t.Fatal(err)
	}
	if len(r.Sedes) != 1 || r.Sedes[0].Nombre != "Sede abierta" || r.Sedes[0].Lat == nil {
		t.Fatalf("sedes inesperadas: %+v", r.Sedes)
	}
}
