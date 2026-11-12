package pruebas

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/cuentas"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// appConCifrador: copia de la app de pruebas con llave de cifrado (para los DNI de las verificaciones).
func appConCifrador(t *testing.T) *core.App {
	t.Helper()
	cif, err := seguridad.NuevoCifrador("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	if err != nil {
		t.Fatal(err)
	}
	a := *app
	a.Cifrador = cif
	return &a
}

func numeroLibre() string { return fmt.Sprintf("98%07d", siguiente()) }

func sesion(t *testing.T, uid, token string) {
	t.Helper()
	if _, err := base.Exec(`INSERT INTO refresh_tokens (usuario_id, token_hash, expira_en) VALUES ($1, $2, now() + interval '1 day')`,
		uid, seguridad.HashSHA256(token)); err != nil {
		t.Fatal(err)
	}
}

func abiertas(t *testing.T, uid string) int {
	return numero(t, `SELECT count(*) FROM refresh_tokens WHERE usuario_id=$1 AND NOT revocado`, uid)
}

// Con sesión: cambia el número, deja abierto este equipo y cierra los demás.
func TestCambioDeNumeroConservaEsteEquipo(t *testing.T) {
	necesitaBase(t)
	uid := crearUsuario(t, "vendedor")
	este, otro := fmt.Sprintf("este-%d", siguiente()), fmt.Sprintf("otro-%d", siguiente())
	sesion(t, uid, este)
	sesion(t, uid, otro)
	nuevo := numeroLibre()
	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := cuentas.Aplicar(context.Background(), tx, app, cuentas.Cambio{UsuarioID: uid, Nuevo: nuevo, ConservarSesion: este, Actor: uid, Origen: "directo"})
		return err
	})
	if c := texto(t, `SELECT celular FROM usuarios WHERE id=$1`, uid); c != nuevo {
		t.Fatalf("el número debía ser %s, quedó %s", nuevo, c)
	}
	if n := abiertas(t, uid); n != 1 {
		t.Fatalf("debía quedar abierta solo la sesión de este equipo, quedaron %d", n)
	}
	if n := numero(t, `SELECT count(*) FROM refresh_tokens WHERE token_hash=$1 AND NOT revocado`, seguridad.HashSHA256(este)); n != 1 {
		t.Fatal("se cerró la sesión del equipo que hizo el cambio")
	}
}

// Un número que ya es de otra cuenta no se puede usar.
func TestCambioANumeroDeOtraCuentaSeRechaza(t *testing.T) {
	necesitaBase(t)
	uid := crearUsuario(t, "vendedor")
	otra := crearUsuario(t, "vendedor")
	ocupado := texto(t, `SELECT celular FROM usuarios WHERE id=$1`, otra)
	antes := texto(t, `SELECT celular FROM usuarios WHERE id=$1`, uid)
	err := intentar(t, func(tx *sql.Tx) error {
		_, err := cuentas.Aplicar(context.Background(), tx, app, cuentas.Cambio{UsuarioID: uid, Nuevo: ocupado, Actor: uid, Origen: "directo"})
		return err
	})
	if err == nil {
		t.Fatal("debía rechazar un número que ya es de otra cuenta")
	}
	if c := texto(t, `SELECT celular FROM usuarios WHERE id=$1`, uid); c != antes {
		t.Fatal("el número no debía cambiar")
	}
}

// vendedoraVerificada crea una tienda con DNI aprobado y app autenticadora activa. Devuelve usuario y celular.
func vendedoraVerificada(t *testing.T, a *core.App, dni string) (string, string) {
	t.Helper()
	tid := crearTienda(t)
	uid := texto(t, `SELECT usuario_id::text FROM tiendas WHERE id=$1`, tid)
	cifrado, err := a.Cifrador.Cifrar(dni)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`INSERT INTO verificaciones (tienda_id, tipo_documento, numero_cifrado, ultimos4, nombre_completo, frente_key, selfie_key, estado, clase, revisado_en)
		VALUES ($1, 'dni', $2, $3, 'Nombre de prueba', 'dni/frente', 'dni/selfie', 'aprobada', 'identidad', now())`, tid, cifrado, dni[len(dni)-4:]); err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`UPDATE usuarios SET totp_activo=true, totp_secreto_cifrado='x', totp_respaldo='{a,b}' WHERE id=$1`, uid); err != nil {
		t.Fatal(err)
	}
	return uid, texto(t, `SELECT celular FROM usuarios WHERE id=$1`, uid)
}

func solicitar(t *testing.T, a *core.App, anterior, nuevo, dni string) bool {
	t.Helper()
	var creada bool
	enTransaccion(t, func(tx *sql.Tx) error {
		var err error
		creada, err = cuentas.Crear(context.Background(), tx, a, cuentas.Solicitud{
			CelularAnterior: anterior, CelularNuevo: nuevo, Documento: dni,
			FrenteKey: cuentas.PrefijoArchivos + "x/frente", SelfieKey: cuentas.PrefijoArchivos + "x/selfie",
		})
		return err
	})
	return creada
}

// Sin el número: la solicitud solo se crea si el DNI coincide; al aprobarla se cierran todas las
// sesiones, se quita la app autenticadora y se avisa por SMS al número nuevo.
func TestSolicitudAprobadaCambiaNumeroYCierraTodo(t *testing.T) {
	necesitaBase(t)
	a := appConCifrador(t)
	uid, anterior := vendedoraVerificada(t, a, "45678912")
	sesion(t, uid, fmt.Sprintf("s-%d", siguiente()))
	nuevo := numeroLibre()

	if solicitar(t, a, anterior, nuevo, "11111111") {
		t.Fatal("con otro DNI no debía crearse la solicitud")
	}
	if solicitar(t, a, "900000000", nuevo, "45678912") {
		t.Fatal("con un número sin cuenta no debía crearse la solicitud")
	}
	if !solicitar(t, a, anterior, nuevo, "45678912") {
		t.Fatal("con el DNI correcto debía crearse la solicitud")
	}
	if solicitar(t, a, anterior, nuevo, "45678912") {
		t.Fatal("no debía haber dos solicitudes pendientes")
	}
	id := texto(t, `SELECT id::text FROM solicitudes_celular WHERE usuario_id=$1 AND estado='pendiente'`, uid)
	adm := crearUsuario(t, "admin")
	enTransaccion(t, func(tx *sql.Tx) error { return cuentas.Aprobar(context.Background(), tx, a, id, adm) })

	if c := texto(t, `SELECT celular FROM usuarios WHERE id=$1`, uid); c != nuevo {
		t.Fatalf("el número debía ser %s, quedó %s", nuevo, c)
	}
	if n := abiertas(t, uid); n != 0 {
		t.Fatalf("debían cerrarse todas las sesiones, quedaron %d", n)
	}
	if n := numero(t, `SELECT count(*) FROM usuarios WHERE id=$1 AND (totp_activo OR totp_secreto_cifrado IS NOT NULL OR cardinality(totp_respaldo)>0)`, uid); n != 0 {
		t.Fatal("debía quitarse la app autenticadora")
	}
	if n := numero(t, `SELECT count(*) FROM sms_salientes WHERE celular=$1`, nuevo); n != 1 {
		t.Fatalf("debía encolarse 1 SMS al número nuevo, hay %d", n)
	}
	if err := intentar(t, func(tx *sql.Tx) error { return cuentas.Aprobar(context.Background(), tx, a, id, adm) }); err == nil {
		t.Fatal("una solicitud ya aprobada no se aprueba otra vez")
	}
}

// Rechazar no toca la cuenta.
func TestSolicitudRechazadaNoCambiaNada(t *testing.T) {
	necesitaBase(t)
	a := appConCifrador(t)
	uid, anterior := vendedoraVerificada(t, a, "76543210")
	sesion(t, uid, fmt.Sprintf("s-%d", siguiente()))
	nuevo := numeroLibre()
	if !solicitar(t, a, anterior, nuevo, "76543210") {
		t.Fatal("debía crearse la solicitud")
	}
	id := texto(t, `SELECT id::text FROM solicitudes_celular WHERE usuario_id=$1 AND estado='pendiente'`, uid)
	adm := crearUsuario(t, "admin")
	enTransaccion(t, func(tx *sql.Tx) error {
		return cuentas.Rechazar(context.Background(), tx, a, id, adm, "La selfie no coincide con el DNI.")
	})
	if c := texto(t, `SELECT celular FROM usuarios WHERE id=$1`, uid); c != anterior {
		t.Fatal("el número no debía cambiar")
	}
	if n := abiertas(t, uid); n != 1 {
		t.Fatal("las sesiones no debían cerrarse")
	}
	if n := numero(t, `SELECT count(*) FROM usuarios WHERE id=$1 AND totp_activo`, uid); n != 1 {
		t.Fatal("la app autenticadora no debía quitarse")
	}
	if e := texto(t, `SELECT estado FROM solicitudes_celular WHERE id=$1`, id); e != "rechazada" {
		t.Fatalf("la solicitud debía quedar rechazada, está %s", e)
	}
}
