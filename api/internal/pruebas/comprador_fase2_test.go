package pruebas

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/comprador"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/productos"
)

// llamarComprador hace una petición a las rutas del comprador con la sesión de uid.
func llamarComprador(t *testing.T, uid, metodo, ruta, cuerpo string) int {
	t.Helper()
	rt := chi.NewRouter()
	comprador.Nuevo(app).Rutas(rt)
	req := httptest.NewRequest(metodo, ruta, strings.NewReader(cuerpo))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(httpx.ConUsuario(req.Context(), httpx.Usuario{ID: uid, Rol: "comprador"}))
	rec := httptest.NewRecorder()
	rt.ServeHTTP(rec, req)
	return rec.Code
}

// pedidoDe crea un pedido de la tienda tid comprado por uid y devuelve su código.
func pedidoDe(t *testing.T, tid, uid string) (pid, codigo string) {
	t.Helper()
	pid = crearPedido(t, tid, "por_aceptar", "pendiente", 0)
	if _, err := base.Exec(`UPDATE pedidos SET comprador_id=$2 WHERE id=$1`, pid, uid); err != nil {
		t.Fatal(err)
	}
	return pid, texto(t, `SELECT codigo FROM pedidos WHERE id=$1`, pid)
}

// Al cambiar el estado del pedido o del pago, el comprador con cuenta recibe un aviso;
// al entregarse, el aviso lo lleva a valorar.
func TestAvisosAlCompradorConCuenta(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	uid := crearUsuario(t, "comprador")
	pid, codigo := pedidoDe(t, tid, uid)
	for _, e := range []string{"preparando", "enviado", "entregado"} {
		if _, err := base.Exec(`UPDATE pedidos SET estado=$2 WHERE id=$1`, pid, e); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := base.Exec(`UPDATE pagos SET estado='informado_tienda' WHERE pedido_id=$1`, pid); err != nil {
		t.Fatal(err)
	}
	if n := numero(t, `SELECT count(*) FROM notificaciones WHERE usuario_id=$1`, uid); n != 4 {
		t.Fatalf("debían llegar 4 avisos, llegaron %d", n)
	}
	if n := numero(t, `SELECT count(*) FROM notificaciones WHERE usuario_id=$1 AND enlace=$2`, uid, "/mi-cuenta/valorar/"+codigo); n != 1 {
		t.Fatal("el aviso de entregado debía llevar a valorar el pedido")
	}
}

// Solo quien compró valora, solo cuando está entregado y una sola vez.
func TestValorarPedido(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	uid := crearUsuario(t, "comprador")
	otro := crearUsuario(t, "comprador")
	pid, codigo := pedidoDe(t, tid, uid)
	ruta := "/pedidos/" + codigo + "/valorar"
	cuerpo := `{"tienda":5,"productos":{},"comentario":"Todo llegó bien"}`

	if c := llamarComprador(t, uid, "POST", ruta, cuerpo); c != http.StatusBadRequest {
		t.Fatalf("sin entregar no se puede valorar (respondió %d)", c)
	}
	if _, err := base.Exec(`UPDATE pedidos SET estado='entregado' WHERE id=$1`, pid); err != nil {
		t.Fatal(err)
	}
	if c := llamarComprador(t, otro, "POST", ruta, cuerpo); c != http.StatusNotFound {
		t.Fatalf("otra persona no puede valorar el pedido (respondió %d)", c)
	}
	if c := llamarComprador(t, uid, "POST", ruta, `{"tienda":0}`); c != http.StatusBadRequest {
		t.Fatalf("las estrellas van de 1 a 5 (respondió %d)", c)
	}
	if c := llamarComprador(t, uid, "POST", ruta, cuerpo); c != http.StatusOK {
		t.Fatalf("debía poder valorar (respondió %d)", c)
	}
	if c := llamarComprador(t, uid, "POST", ruta, cuerpo); c != http.StatusConflict {
		t.Fatalf("no se valora dos veces (respondió %d)", c)
	}
	if n := numero(t, `SELECT estrellas_tienda FROM valoraciones WHERE pedido_id=$1`, pid); n != 5 {
		t.Fatalf("debía guardar 5 estrellas, guardó %d", n)
	}
}

// La primera dirección queda como principal y al borrarla otra toma su lugar; nadie toca direcciones ajenas.
func TestDireccionesGuardadas(t *testing.T) {
	necesitaBase(t)
	uid := crearUsuario(t, "comprador")
	otro := crearUsuario(t, "comprador")
	for _, d := range []string{"Av. Arequipa 123", "Jr. Cusco 456"} {
		if c := llamarComprador(t, uid, "POST", "/direcciones", `{"etiqueta":"Casa","direccion":"`+d+`","distrito":"Lince","ciudad":"Lima"}`); c != http.StatusOK {
			t.Fatalf("no se guardó la dirección (respondió %d)", c)
		}
	}
	principal := texto(t, `SELECT id::text FROM direcciones WHERE usuario_id=$1 AND principal`, uid)
	if d := texto(t, `SELECT direccion FROM direcciones WHERE id=$1`, principal); d != "Av. Arequipa 123" {
		t.Fatalf("la primera debía ser la principal, es %s", d)
	}
	if c := llamarComprador(t, otro, "DELETE", "/direcciones/"+principal, ""); c != http.StatusNotFound {
		t.Fatalf("otra persona no puede borrarla (respondió %d)", c)
	}
	if c := llamarComprador(t, uid, "DELETE", "/direcciones/"+principal, ""); c != http.StatusNoContent {
		t.Fatalf("no se borró (respondió %d)", c)
	}
	if d := texto(t, `SELECT direccion FROM direcciones WHERE usuario_id=$1 AND principal`, uid); d != "Jr. Cusco 456" {
		t.Fatalf("la otra debía pasar a principal, es %s", d)
	}
}

// El comprador pregunta en un producto; cuando la tienda responde, le llega un aviso que lo lleva al producto.
// En su propia tienda no puede preguntar.
func TestPreguntaDelCompradorYAvisoAlResponder(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	verificar(t, tid, "identidad")
	duena := texto(t, `SELECT usuario_id::text FROM tiendas WHERE id=$1`, tid)
	var pid string
	if err := base.QueryRow(`INSERT INTO productos (tienda_id, nombre, precio_centimos, stock) VALUES ($1, 'Aretes de plata', 3500, 5) RETURNING id::text`, tid).Scan(&pid); err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`UPDATE tiendas SET respuestas_automaticas=false WHERE id=$1`, tid); err != nil {
		t.Fatal(err)
	}
	uid := crearUsuario(t, "comprador")
	ruta := "/productos/" + pid + "/preguntas"
	if c := llamarComprador(t, duena, "POST", ruta, `{"pregunta":"¿Tienen en dorado?"}`); c != http.StatusBadRequest {
		t.Fatalf("la dueña no puede preguntar en su tienda (respondió %d)", c)
	}
	if c := llamarComprador(t, uid, "POST", ruta, `{"pregunta":"¿Tienen en dorado?"}`); c != http.StatusCreated {
		t.Fatalf("no se publicó la pregunta (respondió %d)", c)
	}
	qid := texto(t, `SELECT id::text FROM preguntas WHERE producto_id=$1 AND usuario_id=$2`, pid, uid)

	rt := chi.NewRouter()
	productos.Nuevo(app).RutasVendedor(rt)
	req := httptest.NewRequest("POST", "/preguntas/"+qid+"/responder", strings.NewReader(`{"respuesta":"Sí, también en dorado."}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(httpx.ConUsuario(req.Context(), httpx.Usuario{ID: duena, Rol: "vendedor"}))
	rec := httptest.NewRecorder()
	rt.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("no se respondió (respondió %d)", rec.Code)
	}
	if n := numero(t, `SELECT count(*) FROM notificaciones WHERE usuario_id=$1 AND enlace = '/t/' || (SELECT slug FROM tiendas WHERE id=$3) || '/p/' || $2::text`, uid, pid, tid); n != 1 {
		t.Fatalf("debía llegar 1 aviso al comprador, llegaron %d", n)
	}
}

// "Ofertas" del inicio muestra solo los descuentos de las tiendas que el comprador sigue.
func TestOfertasSoloDeTiendasQueSigue(t *testing.T) {
	necesitaBase(t)
	seguida, otra := crearTienda(t), crearTienda(t)
	verificar(t, seguida, "identidad")
	verificar(t, otra, "identidad")
	oferta := func(tid, nombre string) string {
		var pid string
		if err := base.QueryRow(`INSERT INTO productos (tienda_id, nombre, precio_centimos, stock) VALUES ($1, $2, 4500, 5) RETURNING id::text`, tid, nombre).Scan(&pid); err != nil {
			t.Fatal(err)
		}
		if _, err := base.Exec(`INSERT INTO ofertas (producto_id, descuento_pct, termina_en) VALUES ($1, 20, now() + interval '1 day')`, pid); err != nil {
			t.Fatal(err)
		}
		return pid
	}
	suya, ajena := oferta(seguida, "Aretes"), oferta(otra, "Collar")
	uid := crearUsuario(t, "comprador")
	if c := llamarComprador(t, uid, "PUT", "/favoritos/tiendas/"+seguida, ""); c != http.StatusNoContent {
		t.Fatalf("no se pudo seguir la tienda (respondió %d)", c)
	}
	rt := chi.NewRouter()
	comprador.Nuevo(app).Rutas(rt)
	req := httptest.NewRequest("GET", "/ofertas", nil)
	req = req.WithContext(httpx.ConUsuario(req.Context(), httpx.Usuario{ID: uid, Rol: "comprador"}))
	rec := httptest.NewRecorder()
	rt.ServeHTTP(rec, req)
	var r struct {
		Ofertas []comprador.Oferta `json:"ofertas"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &r); err != nil {
		t.Fatal(err)
	}
	if len(r.Ofertas) != 1 || r.Ofertas[0].ID != suya || r.Ofertas[0].Final != 3600 {
		t.Fatalf("debía salir solo la oferta de la tienda seguida a S/ 36 (salió %+v)", r.Ofertas)
	}
	_ = ajena
}
