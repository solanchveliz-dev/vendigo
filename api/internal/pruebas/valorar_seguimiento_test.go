package pruebas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/compras"
)

// Desde el enlace de seguimiento (con o sin cuenta) el cliente califica su pedido cuando ya lo recibió:
// la pantalla le ofrece "valorar", se guarda una sola vez, las fotos tienen que ser de ese pedido y hay plazo de 30 días.
func TestCalificarDesdeElSeguimiento(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	pid := crearPedido(t, tid, "enviado", "informado_tienda", 0)
	token := "tok" + strings.ReplaceAll(pid, "-", "")
	if _, err := base.Exec(`UPDATE pedidos SET token_seguimiento=$2 WHERE id=$1`, pid, token); err != nil {
		t.Fatal(err)
	}
	rt := chi.NewRouter()
	compras.Nuevo(app).Rutas(rt)
	llamar := func(metodo, ruta, cuerpo string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		rt.ServeHTTP(rec, httptest.NewRequest(metodo, "/seguimiento/"+token+ruta, strings.NewReader(cuerpo)))
		return rec
	}
	acciones := func() []string {
		var d struct {
			Pedido struct {
				Acciones []string `json:"acciones"`
			} `json:"pedido"`
		}
		rec := llamar("GET", "", "")
		json.Unmarshal(rec.Body.Bytes(), &d)
		return d.Pedido.Acciones
	}
	tiene := func(lista []string, a string) bool {
		for _, x := range lista {
			if x == a {
				return true
			}
		}
		return false
	}

	if c := llamar("POST", "/valorar", `{"tienda":5}`).Code; c != http.StatusBadRequest {
		t.Fatalf("sin recibirlo no se califica (respondió %d)", c)
	}
	if _, err := base.Exec(`UPDATE pedidos SET estado='entregado', entregado_en=now() WHERE id=$1`, pid); err != nil {
		t.Fatal(err)
	}
	if a := acciones(); !tiene(a, "valorar") {
		t.Fatalf("al recibirlo la pantalla debe pedir la calificación; acciones: %v", a)
	}
	if c := llamar("POST", "/valorar", `{"tienda":5,"fotos":["valoracion/otro-pedido/x"]}`).Code; c != http.StatusBadRequest {
		t.Fatalf("una foto de otro pedido no se acepta (respondió %d)", c)
	}
	if c := llamar("POST", "/valorar", `{"tienda":4,"comentario":"Llegó bien empacado"}`).Code; c != http.StatusOK {
		t.Fatalf("debía poder calificar (respondió %d)", c)
	}
	if c := llamar("POST", "/valorar", `{"tienda":4}`).Code; c != http.StatusConflict {
		t.Fatalf("no se califica dos veces (respondió %d)", c)
	}
	if a := acciones(); tiene(a, "valorar") {
		t.Fatalf("ya calificado, no se vuelve a pedir; acciones: %v", a)
	}
	if n := numero(t, `SELECT estrellas_tienda FROM valoraciones WHERE pedido_id=$1`, pid); n != 4 {
		t.Fatalf("debía guardar 4 estrellas, guardó %d", n)
	}

	// Pasados 30 días ya no se puede calificar.
	viejo := crearPedido(t, tid, "entregado", "informado_tienda", 0)
	tokenViejo := "tok" + strings.ReplaceAll(viejo, "-", "")
	base.Exec(`UPDATE pedidos SET token_seguimiento=$2, entregado_en=now() - interval '31 days' WHERE id=$1`, viejo, tokenViejo)
	rec := httptest.NewRecorder()
	rt.ServeHTTP(rec, httptest.NewRequest("POST", "/seguimiento/"+tokenViejo+"/valorar", strings.NewReader(`{"tienda":5}`)))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("fuera de plazo no se califica (respondió %d)", rec.Code)
	}
}
