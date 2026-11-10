package billetera

import (
	"context"
	"log/slog"
	"strings"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
)

// Notificar crea un aviso dentro de la plataforma para el dueño de la tienda.
// El tipo (para los filtros) sale de a dónde lleva el aviso.
func Notificar(ctx context.Context, q core.Ejecutor, tiendaID, titulo, cuerpo, enlace string) {
	tipo := "pedidos"
	switch {
	case strings.HasPrefix(enlace, "/vendedor/cobros"), strings.HasPrefix(enlace, "/vendedor/plan"):
		tipo = "pagos"
	case strings.HasPrefix(enlace, "/vendedor/consultas"):
		tipo = "consultas"
	case strings.HasPrefix(enlace, "/vendedor/productos"):
		tipo = "inventario"
	}
	// La tienda puede apagar los avisos de pedidos, consultas o inventario; los de pagos y reclamos siempre llegan.
	if _, err := q.ExecContext(ctx, `INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo)
		SELECT usuario_id, $2, $3, $4, $5 FROM tiendas WHERE id=$1 AND ($5 = 'pagos' OR COALESCE((avisos->>$5)::boolean, true))`,
		tiendaID, titulo, cuerpo, enlace, tipo); err != nil {
		slog.Error("notificación", "err", err)
	}
}
