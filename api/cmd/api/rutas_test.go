package main

import (
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/config"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
)

// VendiGo no custodia dinero: ninguna ruta de saldos, liberaciones, retiros o cuentas bancarias debe existir.
// Si alguien vuelve a montar una, esta prueba falla. (No necesita base de datos.)
func TestNoQuedanRutasDeDineroEnCustodia(t *testing.T) {
	app := &core.App{Cfg: config.Config{Entorno: "dev", JWTSecreto: "prueba"}}
	r, ok := rutas(app).(chi.Routes)
	if !ok {
		t.Fatal("el router de la API no es de chi")
	}
	prohibidas := []string{"/retiros", "/cuenta-bancaria", "/cobros", "/billetera", "/movimientos", "/liberar", "/saldo"}
	total := 0
	err := chi.Walk(r, func(metodo, ruta string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		total++
		for _, p := range prohibidas {
			if strings.Contains(ruta, p) {
				t.Errorf("sigue existiendo la ruta %s %s", metodo, ruta)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	// Control: si el recorrido no encuentra las rutas de siempre, la prueba no estaría revisando nada.
	if total < 100 {
		t.Fatalf("solo se encontraron %d rutas; el recorrido no está viendo la API completa", total)
	}
}
