package pruebas

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/productos"
)

// "Lo más vendido" intercala los productos impulsados (pagados) con los que más se venden,
// y los impulsados siempre van marcados.
func TestMasVendidosIntercalaImpulsados(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	verificar(t, tid, "identidad")
	var normal, pagado string
	if err := base.QueryRow(`INSERT INTO productos (tienda_id, nombre, precio_centimos, stock) VALUES ($1, 'Alfajores', 2800, 10) RETURNING id::text`, tid).Scan(&normal); err != nil {
		t.Fatal(err)
	}
	if err := base.QueryRow(`INSERT INTO productos (tienda_id, nombre, precio_centimos, stock, destacado_hasta) VALUES ($1, 'Torta impulsada', 5000, 3, now() + interval '1 day') RETURNING id::text`, tid).Scan(&pagado); err != nil {
		t.Fatal(err)
	}
	rt := chi.NewRouter()
	productos.Nuevo(app).RutasPublicas(rt)
	rec := httptest.NewRecorder()
	rt.ServeHTTP(rec, httptest.NewRequest("GET", "/mas-vendidos", nil))
	if rec.Code != 200 {
		t.Fatalf("respondió %d", rec.Code)
	}
	var r struct {
		Productos []productos.Vendido `json:"productos"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &r); err != nil {
		t.Fatal(err)
	}
	vistos := map[string]int{}
	for _, p := range r.Productos {
		vistos[p.ID]++
		if p.ID == pagado && !p.Impulsado {
			t.Fatal("el producto pagado debe ir marcado como impulsado")
		}
		if p.ID == normal && p.Impulsado {
			t.Fatal("un producto sin pagar no puede ir marcado como impulsado")
		}
	}
	if vistos[pagado] != 1 || vistos[normal] != 1 {
		t.Fatalf("cada producto debe salir una sola vez (impulsado %d, normal %d)", vistos[pagado], vistos[normal])
	}
	if !r.Productos[0].Impulsado {
		t.Fatal("el primer lugar es para un impulsado, como en Marketplace")
	}
}
