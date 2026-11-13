package pruebas

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// La página pública de la tienda muestra cuántas personas la siguen y las opiniones de compras reales,
// con solo el primer nombre de quien opinó.
func TestPaginaTiendaSeguidoresYOpiniones(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	verificar(t, tid, "identidad")
	var slug string
	if err := base.QueryRow(`SELECT slug FROM tiendas WHERE id=$1`, tid).Scan(&slug); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if _, err := base.Exec(`INSERT INTO favoritos_tiendas (usuario_id, tienda_id) VALUES ($1, $2)`, crearUsuario(t, "comprador"), tid); err != nil {
			t.Fatal(err)
		}
	}
	pid := crearPedido(t, tid, "entregado", "informado_tienda", 3)
	comprador := crearUsuario(t, "comprador")
	if _, err := base.Exec(`UPDATE usuarios SET nombre='Lucía Ramos Pérez' WHERE id=$1`, comprador); err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`INSERT INTO valoraciones (pedido_id, usuario_id, tienda_id, estrellas_tienda, comentario) VALUES ($1, $2, $3, 5, 'Llegó perfecta')`, pid, comprador, tid); err != nil {
		t.Fatal(err)
	}

	rt := chi.NewRouter()
	tiendas.Nuevo(app).RutasPublicas(rt)
	rec := httptest.NewRecorder()
	rt.ServeHTTP(rec, httptest.NewRequest("GET", "/tiendas/"+slug, nil))
	if rec.Code != 200 {
		t.Fatalf("respondió %d: %s", rec.Code, rec.Body.String())
	}
	var r struct {
		Seguidores int                     `json:"seguidores"`
		Opiniones  []tiendas.OpinionTienda `json:"opiniones"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &r); err != nil {
		t.Fatal(err)
	}
	if r.Seguidores != 2 {
		t.Fatalf("seguidores = %d, se esperaban 2", r.Seguidores)
	}
	if len(r.Opiniones) != 1 || r.Opiniones[0].Autor != "Lucía" || r.Opiniones[0].Comentario != "Llegó perfecta" || r.Opiniones[0].Estrellas != 5 {
		t.Fatalf("opiniones inesperadas: %+v", r.Opiniones)
	}
}
