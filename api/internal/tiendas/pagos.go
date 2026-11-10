package tiendas

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// guardarPagos: cómo le pagan los clientes a la tienda. El dinero va directo a la vendedora
// (su Yape o Plin); VendiGo solo muestra estos datos al comprador y da seguimiento.
func (m *Modulo) guardarPagos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Yape    string  `json:"yape_numero"`
		Plin    string  `json:"plin_numero"`
		Titular string  `json:"pago_titular"`
		QRKey   *string `json:"pago_qr_key"`
		Tarjeta string  `json:"tarjeta_link"` // opcional: link de pago con tarjeta de la propia tienda
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	celular := func(c string) bool { return len(c) == 9 && c[0] == '9' && strings.Trim(c, "0123456789") == "" }
	in.Yape, in.Plin, in.Titular, in.Tarjeta = strings.TrimSpace(in.Yape), strings.TrimSpace(in.Plin), strings.TrimSpace(in.Titular), strings.TrimSpace(in.Tarjeta)
	switch {
	case in.Yape != "" && !celular(in.Yape):
		return httpx.Invalido("El número de Yape debe ser un celular de 9 dígitos que empiece con 9.")
	case in.Plin != "" && !celular(in.Plin):
		return httpx.Invalido("El número de Plin debe ser un celular de 9 dígitos que empiece con 9.")
	case in.Tarjeta != "" && !linkValido(in.Tarjeta):
		return httpx.Invalido("El link de pago con tarjeta debe empezar con https:// (por ejemplo, tu link de Mercado Pago o Izipay).")
	case in.Yape == "" && in.Plin == "" && in.Tarjeta == "":
		return httpx.Invalido("Agrega tu Yape, tu Plin o tu link de pago con tarjeta para que tus clientes te paguen.")
	case (in.Yape != "" || in.Plin != "") && len([]rune(in.Titular)) < 3:
		return httpx.Invalido("Escribe el nombre que aparece en tu Yape o Plin, así tus clientes confirman que te pagan a ti.")
	}
	if in.QRKey != nil && *in.QRKey == "" {
		in.QRKey = nil
	}
	if err := m.validarImagen(ctx, tid, in.QRKey, "pago_qr"); err != nil {
		return err
	}
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE tiendas SET yape_numero=$2, plin_numero=$3, pago_titular=$4, pago_qr_key=$5, tarjeta_link=$6, acepta_efectivo=false, actualizado_en=now() WHERE id=$1`,
		tid, in.Yape, in.Plin, in.Titular, in.QRKey, in.Tarjeta); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(ctx)
	m.app.Auditar(ctx, m.app.DB, u.ID, "datos_pago_tienda", "tienda", tid, map[string]bool{"yape": in.Yape != "", "plin": in.Plin != "", "tarjeta": in.Tarjeta != ""})
	return m.obtener(w, r)
}

// linkValido acepta solo enlaces https de hasta 300 caracteres.
func linkValido(s string) bool {
	u, err := url.Parse(s)
	return err == nil && u.Scheme == "https" && u.Host != "" && len(s) <= 300
}
