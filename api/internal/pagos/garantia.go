package pagos

import (
	"context"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
)

// Garantia: reglas del fondo de emergencia de VendiGo. Es un solo fondo común: se alimenta con un Porcentaje
// de todo lo que cobra VendiGo (planes, ventas extra, impulsos y créditos de IA) más un AporteInicial.
// Cubre pedidos que no le llegaron al comprador: reclamo "no llegó" a su favor o la tienda canceló después
// de cobrar. Si la tienda no le devuelve en DiasHabiles, VendiGo le devuelve hasta Tope y suspende la tienda
// (no se le pide reponer: el admin decide si la reactiva tras revisar el caso).
type Garantia struct {
	Tope          int `json:"tope_centimos"`
	DiasHabiles   int `json:"dias_habiles"`
	Porcentaje    int `json:"porcentaje"`
	AporteInicial int `json:"aporte_inicial_centimos"`
}

func LeerGarantia(ctx context.Context, q core.Ejecutor) Garantia {
	g := Garantia{Tope: 15000, DiasHabiles: 5, Porcentaje: 4}
	q.QueryRowContext(ctx, `SELECT COALESCE((SELECT valor::int FROM ajustes_plataforma WHERE clave='garantia_tope_centimos'), 15000),
		COALESCE((SELECT valor::int FROM ajustes_plataforma WHERE clave='garantia_dias_habiles'), 5),
		COALESCE((SELECT valor::int FROM ajustes_plataforma WHERE clave='fondo_porcentaje'), 4),
		COALESCE((SELECT valor::int FROM ajustes_plataforma WHERE clave='fondo_aporte_inicial_centimos'), 0)`).
		Scan(&g.Tope, &g.DiasHabiles, &g.Porcentaje, &g.AporteInicial)
	return g
}
