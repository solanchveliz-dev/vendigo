package seguridad

import (
	"testing"
	"time"
)

func TestPassword(t *testing.T) {
	h, err := HashPassword("clave-segura-123")
	if err != nil {
		t.Fatal(err)
	}
	if !VerificarPassword("clave-segura-123", h) {
		t.Error("la contraseña correcta no se aceptó")
	}
	if VerificarPassword("otra-clave", h) {
		t.Error("se aceptó una contraseña incorrecta")
	}
	h2, _ := HashPassword("clave-segura-123")
	if h == h2 {
		t.Error("dos hashes de la misma contraseña deben ser distintos (sal aleatoria)")
	}
}

func TestJWT(t *testing.T) {
	tok, err := FirmarAcceso("secreto", "usuario-1", "vendedor", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	c, err := LeerAcceso("secreto", tok)
	if err != nil || c.Subject != "usuario-1" || c.Rol != "vendedor" {
		t.Fatalf("token no válido: %v %+v", err, c)
	}
	if _, err := LeerAcceso("otro-secreto", tok); err == nil {
		t.Error("un token firmado con otro secreto no debe aceptarse")
	}
	vencido, _ := FirmarAcceso("secreto", "usuario-1", "vendedor", -time.Minute)
	if _, err := LeerAcceso("secreto", vencido); err == nil {
		t.Error("un token vencido no debe aceptarse")
	}
}

func TestCifrado(t *testing.T) {
	c, err := NuevoCifrador("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	if err != nil {
		t.Fatal(err)
	}
	v, _ := c.Cifrar("45678912")
	if v == "45678912" {
		t.Fatal("el dato no se cifró")
	}
	p, err := c.Descifrar(v)
	if err != nil || p != "45678912" {
		t.Fatalf("no se pudo descifrar: %v", err)
	}
	if _, err := NuevoCifrador("corta"); err == nil {
		t.Error("una llave corta debe rechazarse")
	}
}

func TestOTP(t *testing.T) {
	for i := 0; i < 50; i++ {
		if c := CodigoOTP(); len(c) != 6 {
			t.Fatalf("el código debe tener 6 dígitos: %q", c)
		}
	}
	if HashOTP("s", "999", "123456") == HashOTP("s", "999", "123457") {
		t.Error("códigos distintos no deben tener el mismo hash")
	}
}

func TestValidarPassword(t *testing.T) {
	casos := map[string]bool{"corta1A": false, "sinmayuscula1": false, "SINMINUSCULA1": false, "SinNumero": false, "Vendigo2026": true}
	for p, ok := range casos {
		if (ValidarPassword(p) == "") != ok {
			t.Errorf("%q: esperaba válida=%v", p, ok)
		}
	}
}

// Vector de prueba del RFC 6238 (SHA1, secreto "12345678901234567890").
func TestTOTP(t *testing.T) {
	sec := b32.EncodeToString([]byte("12345678901234567890"))
	if _, ok := VerificarTOTP(sec, "287082", time.Unix(59, 0)); !ok {
		t.Fatal("el código del RFC debería ser válido")
	}
	if _, ok := VerificarTOTP(sec, "287082", time.Unix(59+120, 0)); ok {
		t.Fatal("un código viejo no debería servir")
	}
	if c := CodigosRespaldo(3); len(c) != 3 || len(c[0]) != 11 {
		t.Fatal("códigos de respaldo mal formados")
	}
}
