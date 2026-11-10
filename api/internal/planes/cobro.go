package planes

import (
	"context"
	"net/http"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// CobroVendiGo: los métodos con los que las tiendas le pagan a VendiGo (planes, ventas extra e impulsos).
// Los configura el admin. Las tiendas pagan por fuera (Yape, Plin, tarjeta o transferencia) y registran
// en la app el n.° de operación; el admin lo compara y confirma.
type CobroVendiGo struct {
	Yape          string   `json:"yape"`
	Plin          string   `json:"plin"`
	Titular       string   `json:"titular"`
	TarjetaLink   string   `json:"tarjeta_link"`
	TarjetaMarcas []string `json:"tarjeta_marcas"`
	Banco         string   `json:"banco"`
	Cuenta        string   `json:"cuenta"`
	CCI           string   `json:"cci"`
	BancoTitular  string   `json:"banco_titular"`
	Metodos       []string `json:"metodos"` // yape, plin, tarjeta, transferencia (los que están configurados)
}

// ClavesCobro son las claves de ajustes_plataforma de cada dato.
var ClavesCobro = []string{"planes_yape", "planes_plin", "planes_titular", "planes_tarjeta_link", "planes_tarjeta_marcas", "planes_banco", "planes_cuenta", "planes_cci", "planes_banco_titular"}

func LeerCobro(ctx context.Context, q core.Ejecutor) CobroVendiGo {
	v := map[string]string{}
	if rows, err := q.QueryContext(ctx, `SELECT clave, valor FROM ajustes_plataforma WHERE clave LIKE 'planes_%'`); err == nil {
		for rows.Next() {
			var k, x string
			rows.Scan(&k, &x)
			v[k] = x
		}
		rows.Close()
	}
	c := CobroVendiGo{Yape: v["planes_yape"], Plin: v["planes_plin"], Titular: v["planes_titular"], TarjetaLink: v["planes_tarjeta_link"],
		Banco: v["planes_banco"], Cuenta: v["planes_cuenta"], CCI: v["planes_cci"], BancoTitular: v["planes_banco_titular"], TarjetaMarcas: []string{}, Metodos: []string{}}
	for _, m := range strings.Split(v["planes_tarjeta_marcas"], ",") {
		if m = strings.TrimSpace(m); m != "" {
			c.TarjetaMarcas = append(c.TarjetaMarcas, m)
		}
	}
	for m, ok := range map[string]bool{"yape": c.Yape != "", "plin": c.Plin != "", "tarjeta": c.TarjetaLink != "", "transferencia": c.Cuenta != "" || c.CCI != ""} {
		if ok {
			c.Metodos = append(c.Metodos, m)
		}
	}
	slices.SortFunc(c.Metodos, func(a, b string) int { return slices.Index(ordenMetodos, a) - slices.Index(ordenMetodos, b) })
	return c
}

var ordenMetodos = []string{"yape", "plin", "tarjeta", "transferencia"}

// metodoValido: el método debe estar entre los que VendiGo tiene configurados.
func metodoValido(ctx context.Context, q core.Ejecutor, metodo string) error {
	if !slices.Contains(LeerCobro(ctx, q).Metodos, metodo) {
		return httpx.Invalido("Elige cómo le pagaste a VendiGo.")
	}
	return nil
}

// POST /vendedor/plan/pagos/{id}/informar {metodo, referencia}: la tienda avisa que ya pagó y con qué.
func (m *Modulo) informarPago(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Metodo     string `json:"metodo"`
		Referencia string `json:"referencia"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Referencia = strings.TrimSpace(in.Referencia)
	if err := metodoValido(ctx, m.app.DB, in.Metodo); err != nil {
		return err
	}
	if len(in.Referencia) < 4 || len(in.Referencia) > 40 {
		return httpx.Invalido("Escribe el número de operación de tu pago.")
	}
	res, err := m.app.DB.ExecContext(ctx, `UPDATE pagos_plan SET metodo=$3, referencia_tienda=$4 WHERE id::text=$1 AND tienda_id=$2 AND estado='pendiente'`,
		chi.URLParam(r, "id"), tid, in.Metodo, in.Referencia)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.Conflicto("no_aplica", "Este pago ya fue revisado.")
	}
	httpx.OK(w, map[string]string{"mensaje": "¡Gracias! VendiGo revisará tu pago y te avisará cuando esté activo."})
	return nil
}
