package main

import (
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/config"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/ia"
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

// Se quitaron la lectura de boletas y el post para redes: el envío se registra a mano y no gasta créditos.
func TestNoExisteLecturaDeBoletasConIA(t *testing.T) {
	app := &core.App{Cfg: config.Config{Entorno: "dev", JWTSecreto: "prueba"}}
	r := rutas(app).(chi.Routes)
	chi.Walk(r, func(metodo, ruta string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if strings.Contains(ruta, "leer-boleta") || strings.Contains(ruta, "crear-post") {
			t.Errorf("sigue existiendo la ruta %s %s", metodo, ruta)
		}
		return nil
	})
	for _, h := range []string{"leer_boleta", "crear_post"} {
		if _, ok := ia.Costos[h]; ok {
			t.Errorf("la herramienta %s sigue en la lista de costos de IA", h)
		}
	}
	for _, h := range []string{"publicar_con_foto", "analista_ventas"} {
		if _, ok := ia.Costos[h]; !ok {
			t.Errorf("se perdió la herramienta %s, que sí debe seguir", h)
		}
	}
}
