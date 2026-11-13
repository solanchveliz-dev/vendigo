package pruebas

import (
	"context"
	"testing"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/compras"
)

// En "Recojo en tienda" el día es obligatorio, desde hoy, dentro de dos semanas y en un día que la tienda atiende.
func TestDiaDeRecojo(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	// La tienda atiende solo lunes (1) y sábado (6).
	if _, err := base.Exec(`UPDATE tiendas SET dias_recojo='{1,6}' WHERE id=$1`, tid); err != nil {
		t.Fatal(err)
	}
	peru := time.FixedZone("PET", -5*60*60)
	ahora := time.Date(2026, 11, 13, 10, 0, 0, 0, peru) // viernes 13 de noviembre de 2026
	ctx := context.Background()
	casos := []struct {
		dia string
		ok  bool
		por string
	}{
		{"", false, "sin día"},
		{"2026-11-12", false, "ayer"},
		{"2026-11-14", true, "sábado, la tienda atiende"},
		{"2026-11-16", true, "lunes, la tienda atiende"},
		{"2026-11-17", false, "martes, la tienda no atiende"},
		{"2026-11-30", false, "más de dos semanas"},
		{"14/11/2026", false, "formato inválido"},
	}
	for _, c := range casos {
		err := compras.ValidarDiaRecojo(ctx, base, tid, c.dia, ahora)
		if (err == nil) != c.ok {
			t.Fatalf("%s (%q): se esperaba ok=%v, salió %v", c.por, c.dia, c.ok, err)
		}
	}
	// Sin días marcados, cualquier día dentro del plazo sirve.
	if _, err := base.Exec(`UPDATE tiendas SET dias_recojo='{}' WHERE id=$1`, tid); err != nil {
		t.Fatal(err)
	}
	if err := compras.ValidarDiaRecojo(ctx, base, tid, "2026-11-17", ahora); err != nil {
		t.Fatalf("sin días marcados el martes debe servir: %v", err)
	}
}
