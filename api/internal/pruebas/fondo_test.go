package pruebas

import (
	"context"
	"testing"

	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
)

// El fondo de emergencia empieza con el 4 % de los ingresos de VendiGo, tope de S/ 150 y 5 días hábiles,
// y el admin puede cambiar el porcentaje y el aporte inicial desde Configuración.
func TestReglasDelFondoDeEmergencia(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	g := pagos.LeerGarantia(ctx, base)
	if g.Porcentaje != 4 || g.AporteInicial != 0 || g.Tope != 15000 || g.DiasHabiles != 5 {
		t.Fatalf("reglas iniciales inesperadas: %+v", g)
	}
	if _, err := base.Exec(`UPDATE ajustes_plataforma SET valor='6' WHERE clave='fondo_porcentaje'`); err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`UPDATE ajustes_plataforma SET valor='50000' WHERE clave='fondo_aporte_inicial_centimos'`); err != nil {
		t.Fatal(err)
	}
	defer base.Exec(`UPDATE ajustes_plataforma SET valor='4' WHERE clave='fondo_porcentaje'`)
	defer base.Exec(`UPDATE ajustes_plataforma SET valor='0' WHERE clave='fondo_aporte_inicial_centimos'`)
	if g := pagos.LeerGarantia(ctx, base); g.Porcentaje != 6 || g.AporteInicial != 50000 {
		t.Errorf("el porcentaje y el aporte inicial deben salir de Configuración: %+v", g)
	}
}
