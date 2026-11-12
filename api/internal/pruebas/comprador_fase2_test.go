package pruebas

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/comprador"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
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
