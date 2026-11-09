package tiendas

import (
	"net/http"
	"regexp"
	"strings"
	"time"

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
		// Personalización opcional
		DestacadoID *string `json:"destacado_id"`
		Aviso       string  `json:"aviso"`
		Historia    string  `json:"historia"`
		HistoriaKey *string `json:"historia_foto_key"`
		VendeDesde  *int    `json:"vende_desde"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Prefijo = strings.ToUpper(strings.TrimSpace(in.Prefijo))
	in.Aviso, in.Historia = strings.TrimSpace(in.Aviso), strings.TrimSpace(in.Historia)
	if len([]rune(in.Aviso)) > 90 {
		return httpx.Invalido("El aviso puede tener hasta 90 caracteres.")
	}
	if len([]rune(in.Historia)) > 500 {
		return httpx.Invalido("Tu historia puede tener hasta 500 caracteres.")
	}
	if in.VendeDesde != nil && (*in.VendeDesde < 1950 || *in.VendeDesde > time.Now().Year()) {
		return httpx.Invalido("Escribe un año válido para “Vendo desde”.")
	}
	if err := m.validarImagen(ctx, tid, in.HistoriaKey, "historia"); err != nil {
		return err
	}
	if in.DestacadoID != nil && *in.DestacadoID != "" {
		var ok bool
		m.app.DB.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM productos WHERE id::text=$1 AND tienda_id=$2 AND activo AND NOT eliminado)`, *in.DestacadoID, tid).Scan(&ok)
		if !ok {
			return httpx.Invalido("Elige un producto publicado de tu tienda para destacar.")
		}
	} else {
		in.DestacadoID = nil
	}
	if in.HistoriaKey != nil && *in.HistoriaKey == "" {
		in.HistoriaKey = nil
	}
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
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE tiendas SET tema_color=$2, tema_fuente=$3, prefijo_pedido=$4,
		destacado_id=$5, aviso=$6, historia=$7, historia_foto_key=$8, vende_desde=$9, actualizado_en=now() WHERE id=$1`,
		tid, in.Color, in.Fuente, in.Prefijo, in.DestacadoID, in.Aviso, in.Historia, in.HistoriaKey, in.VendeDesde); err != nil {
		if strings.Contains(err.Error(), "tiendas_prefijo_idx") {
			return httpx.Conflicto("prefijo_usado", "Otra tienda ya usa ese prefijo. Prueba con otro.")
		}
		return err
	}
	return m.obtener(w, r)
}
