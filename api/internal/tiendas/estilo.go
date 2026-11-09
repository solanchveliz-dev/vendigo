package tiendas

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Colores y letras que puede elegir la tienda (la web tiene la misma lista con sus tonos).
var (
	TemaColores = map[string]bool{"clasico": true, "rosa": true, "lavanda": true, "oceano": true, "tierra": true, "oliva": true, "noche": true, "frambuesa": true}
	TemaFuentes = map[string]bool{"moderna": true, "elegante": true, "simple": true}
	rePrefijo   = regexp.MustCompile(`^[A-Z]{2,6}$`)
	// Prefijos que no se pueden usar para no confundir con los códigos de la plataforma.
	prefijosReservados = map[string]bool{"VG": true, "INC": true, "VENDIGO": true, "ADMIN": true}
)

func (m *Modulo) guardarEstilo(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Color   string `json:"tema_color"`
		Fuente  string `json:"tema_fuente"`
		Prefijo string `json:"prefijo_pedido"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Prefijo = strings.ToUpper(strings.TrimSpace(in.Prefijo))
	switch {
	case !TemaColores[in.Color]:
		return httpx.Invalido("Elige uno de los colores.")
	case !TemaFuentes[in.Fuente]:
		return httpx.Invalido("Elige uno de los estilos de letra.")
	case in.Prefijo != "" && !rePrefijo.MatchString(in.Prefijo):
		return httpx.Invalido("El prefijo debe tener de 2 a 6 letras, sin números ni tildes (ej. LUNA).")
	case prefijosReservados[in.Prefijo]:
		return httpx.Invalido("Ese prefijo está reservado por VendiGo. Elige otro.")
	}
	if in.Prefijo != "" {
		var usado bool
		m.app.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM tiendas WHERE prefijo_pedido=$1 AND id<>$2)`, in.Prefijo, tid).Scan(&usado)
		if usado {
			return httpx.Conflicto("prefijo_usado", "Otra tienda ya usa ese prefijo. Prueba con otro.")
		}
	}
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE tiendas SET tema_color=$2, tema_fuente=$3, prefijo_pedido=$4, actualizado_en=now() WHERE id=$1`,
		tid, in.Color, in.Fuente, in.Prefijo); err != nil {
		if strings.Contains(err.Error(), "tiendas_prefijo_idx") {
			return httpx.Conflicto("prefijo_usado", "Otra tienda ya usa ese prefijo. Prueba con otro.")
		}
		return err
	}
	return m.obtener(w, r)
}
