package pagos

import (
	"context"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
)

// Garantia: reglas del fondo de emergencia de VendiGo (se alimenta con lo cobrado por impulsar productos).
// Cubre pedidos que no le llegaron al comprador: reclamo "no llegó" a su favor o la tienda canceló después
// de cobrar. Si la tienda no le devuelve en DiasHabiles, VendiGo le devuelve hasta Tope y pausa la tienda.
type Garantia struct {
	Tope        int `json:"tope_centimos"`
	DiasHabiles int `json:"dias_habiles"`
}

func LeerGarantia(ctx context.Context, q core.Ejecutor) Garantia {
	g := Garantia{Tope: 15000, DiasHabiles: 5}
	q.QueryRowContext(ctx, `SELECT COALESCE((SELECT valor::int FROM ajustes_plataforma WHERE clave='garantia_tope_centimos'), 15000),
		COALESCE((SELECT valor::int FROM ajustes_plataforma WHERE clave='garantia_dias_habiles'), 5)`).Scan(&g.Tope, &g.DiasHabiles)
	return g
}
