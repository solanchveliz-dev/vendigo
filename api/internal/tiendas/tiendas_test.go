package tiendas

import "testing"

func TestSlug(t *testing.T) {
	casos := map[string]string{
		"Luna & Sol":      "luna-sol",
		"  Ñandú Café ":   "nandu-cafe",
		"Moda--Perú 2026": "moda-peru-2026",
		"¡Hola!":          "hola",
	}
	for in, esperado := range casos {
		if s := Slug(in); s != esperado {
			t.Errorf("Slug(%q) = %q, esperado %q", in, s, esperado)
		}
	}
}
