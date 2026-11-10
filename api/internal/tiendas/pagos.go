package tiendas

import (
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/lib/pq"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Bancos y cajas que la tienda puede elegir para recibir transferencias.
var Bancos = []string{"BCP", "Interbank", "BBVA", "Scotiabank", "BanBif", "Banco de la Nación", "Banco Pichincha", "Caja Arequipa", "Caja Huancayo", "Caja Piura", "Caja Cusco", "Otro"}

// Marcas de tarjeta que la tienda puede indicar que acepta en su link de pago.
var Marcas = []string{"visa", "mastercard", "amex", "diners"}

// guardarPagos: la tienda elige cómo le pagan sus clientes (Yape, Plin, tarjeta con su propio link
// o transferencia). El dinero va directo a la vendedora; VendiGo solo muestra estos datos al comprador.
func (m *Modulo) guardarPagos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Yape          string   `json:"yape_numero"`
		Plin          string   `json:"plin_numero"`
		Titular       string   `json:"pago_titular"`
		QRKey         *string  `json:"pago_qr_key"` // QR de Yape
		PlinQRKey     *string  `json:"plin_qr_key"`
		Tarjeta       string   `json:"tarjeta_link"`
		Marcas        []string `json:"tarjeta_marcas"`
		TransfBanco   string   `json:"transf_banco"`
		TransfCuenta  string   `json:"transf_cuenta"`
		TransfCCI     string   `json:"transf_cci"`
		TransfTitular string   `json:"transf_titular"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	limpiar := func(s *string) { *s = strings.TrimSpace(*s) }
	for _, s := range []*string{&in.Yape, &in.Plin, &in.Titular, &in.Tarjeta, &in.TransfBanco, &in.TransfCuenta, &in.TransfCCI, &in.TransfTitular} {
		limpiar(s)
	}
	in.TransfCCI = strings.ReplaceAll(in.TransfCCI, "-", "")
	digitos := func(c string) bool { return c != "" && strings.Trim(c, "0123456789") == "" }
	celular := func(c string) bool { return len(c) == 9 && c[0] == '9' && digitos(c) }
	cuenta := strings.ReplaceAll(in.TransfCuenta, "-", "")
	transf := in.TransfCuenta != "" || in.TransfCCI != ""
	if in.Tarjeta == "" {
		in.Marcas = []string{}
	}
	switch {
	case in.Yape != "" && !celular(in.Yape):
		return httpx.Invalido("El número de Yape debe ser un celular de 9 dígitos que empiece con 9.")
	case in.Plin != "" && !celular(in.Plin):
		return httpx.Invalido("El número de Plin debe ser un celular de 9 dígitos que empiece con 9.")
	case (in.Yape != "" || in.Plin != "") && len([]rune(in.Titular)) < 3:
		return httpx.Invalido("Escribe el nombre que aparece en tu Yape o Plin, así tus clientes confirman que te pagan a ti.")
	case in.Tarjeta != "" && !linkValido(in.Tarjeta):
		return httpx.Invalido("El link de pago con tarjeta debe empezar con https:// (por ejemplo, tu link de Mercado Pago o Izipay).")
	case in.Tarjeta != "" && len(in.Marcas) == 0:
		return httpx.Invalido("Marca qué tarjetas aceptas (Visa, Mastercard, etc.).")
	case transf && !slices.Contains(Bancos, in.TransfBanco):
		return httpx.Invalido("Elige el banco de tu cuenta.")
	case in.TransfCuenta != "" && (!digitos(cuenta) || len(cuenta) < 10 || len(cuenta) > 20):
		return httpx.Invalido("El número de cuenta debe tener entre 10 y 20 dígitos.")
	case in.TransfCCI != "" && (!digitos(in.TransfCCI) || len(in.TransfCCI) != 20):
		return httpx.Invalido("El CCI debe tener 20 dígitos.")
	case transf && len([]rune(in.TransfTitular)) < 3:
		return httpx.Invalido("Escribe el titular de la cuenta bancaria.")
	case in.Yape == "" && in.Plin == "" && in.Tarjeta == "" && !transf:
		return httpx.Invalido("Activa al menos un método de pago para que tus clientes te paguen.")
	}
	for _, mk := range in.Marcas {
		if !slices.Contains(Marcas, mk) {
			return httpx.Invalido("Marca de tarjeta no válida.")
		}
	}
	if !transf {
		in.TransfBanco, in.TransfTitular = "", ""
	}
	// Un QR solo tiene sentido si el método está activo.
	if in.Yape == "" || (in.QRKey != nil && *in.QRKey == "") {
		in.QRKey = nil
	}
	if in.Plin == "" || (in.PlinQRKey != nil && *in.PlinQRKey == "") {
		in.PlinQRKey = nil
	}
	for _, k := range []*string{in.QRKey, in.PlinQRKey} {
		if err := m.validarImagen(ctx, tid, k, "pago_qr"); err != nil {
			return err
		}
	}
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE tiendas SET yape_numero=$2, plin_numero=$3, pago_titular=$4, pago_qr_key=$5,
		plin_qr_key=$6, tarjeta_link=$7, tarjeta_marcas=$8, transf_banco=$9, transf_cuenta=$10, transf_cci=$11, transf_titular=$12,
		acepta_efectivo=false, actualizado_en=now() WHERE id=$1`,
		tid, in.Yape, in.Plin, in.Titular, in.QRKey, in.PlinQRKey, in.Tarjeta, pq.Array(in.Marcas),
		in.TransfBanco, in.TransfCuenta, in.TransfCCI, in.TransfTitular); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(ctx)
	m.app.Auditar(ctx, m.app.DB, u.ID, "datos_pago_tienda", "tienda", tid,
		map[string]bool{"yape": in.Yape != "", "plin": in.Plin != "", "tarjeta": in.Tarjeta != "", "transferencia": transf})
	return m.obtener(w, r)
}

// linkValido acepta solo enlaces https de hasta 300 caracteres.
func linkValido(s string) bool {
	u, err := url.Parse(s)
	return err == nil && u.Scheme == "https" && u.Host != "" && len(s) <= 300
}
