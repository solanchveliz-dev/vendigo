package pruebas

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/auth"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// vendedoraConSMS: segundo paso por SMS activo con sus códigos de respaldo.
func vendedoraConSMS(t *testing.T) (uid, celular string, codigos []string) {
	t.Helper()
	uid = crearUsuario(t, "vendedor")
	codigos, huellas := seguridad.NuevosRespaldos()
	if _, err := base.Exec(`UPDATE usuarios SET totp_activo=true, mfa_metodo='sms', totp_respaldo=$2 WHERE id=$1`, uid, pq.Array(huellas)); err != nil {
		t.Fatal(err)
	}
	return uid, texto(t, `SELECT celular FROM usuarios WHERE id=$1`, uid), codigos
}

// Con el método SMS, el código que llega al celular confirma la acción.
func TestSegundoPasoPorSMS(t *testing.T) {
	necesitaBase(t)
	uid, celular, _ := vendedoraConSMS(t)
	if _, err := base.Exec(`INSERT INTO codigos_otp (celular, proposito, codigo_hash, expira_en) VALUES ($1, 'confirmar', $2, $3)`,
		celular, seguridad.HashOTP(app.Cfg.JWTSecreto, celular, "123456"), time.Now().Add(10*time.Minute)); err != nil {
		t.Fatal(err)
	}
	m := auth.Nuevo(app)
	if err := m.ConfirmarPaso(context.Background(), uid, "000000"); err == nil {
		t.Fatal("un código incorrecto no debía pasar")
	}
	if err := m.ConfirmarPaso(context.Background(), uid, "123456"); err != nil {
		t.Fatalf("el código del SMS debía pasar: %v", err)
	}
	if err := m.ConfirmarPaso(context.Background(), uid, "123456"); err == nil {
		t.Fatal("el mismo código no sirve dos veces")
	}
}

// Los códigos de respaldo sirven con el método SMS, se aceptan sin guion y en minúsculas, y una sola vez.
func TestCodigoDeRespaldoConSMS(t *testing.T) {
	necesitaBase(t)
	uid, _, codigos := vendedoraConSMS(t)
	m := auth.Nuevo(app)
	escrito := strings.ToLower(strings.ReplaceAll(codigos[0], "-", ""))
	if err := m.ConfirmarPaso(context.Background(), uid, escrito); err != nil {
		t.Fatalf("el código de respaldo debía pasar: %v", err)
	}
	if n := numero(t, `SELECT cardinality(totp_respaldo) FROM usuarios WHERE id=$1`, uid); n != len(codigos)-1 {
		t.Fatalf("debían quedar %d códigos, quedan %d", len(codigos)-1, n)
	}
	if err := m.ConfirmarPaso(context.Background(), uid, codigos[0]); err == nil {
		t.Fatal("un código de respaldo no sirve dos veces")
	}
}

// Solo existen los métodos "app" y "sms".
func TestMetodoDeSegundoPasoValido(t *testing.T) {
	necesitaBase(t)
	uid := crearUsuario(t, "vendedor")
	if _, err := base.Exec(`UPDATE usuarios SET mfa_metodo='correo' WHERE id=$1`, uid); err == nil {
		t.Fatal("la base debía rechazar un método desconocido")
	}
}
