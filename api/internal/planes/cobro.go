package planes

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"net/mail"
	"slices"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/culqi"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// CobroVendiGo: los métodos con los que las tiendas le pagan a VendiGo (planes, ventas extra e impulsos).
// Los créditos de IA extra solo se pagan con Culqi.
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
	Metodos       []string `json:"metodos"` // culqi, yape, plin, tarjeta, transferencia (los que están configurados)
	CulqiPublica  string   `json:"culqi_publica"`
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

var ordenMetodos = []string{"culqi", "yape", "plin", "tarjeta", "transferencia"}

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
	var tipo string
	m.app.DB.QueryRowContext(ctx, `SELECT tipo FROM pagos_plan WHERE id::text=$1 AND tienda_id=$2`, chi.URLParam(r, "id"), tid).Scan(&tipo)
	if tipo == "creditos_ia" {
		return httpx.Conflicto("solo_culqi", "Los créditos de IA se pagan con Culqi (tarjeta o Yape) y se activan al instante.")
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

// ConfirmarPago marca un pago a VendiGo como confirmado y aplica lo comprado (plan, ventas extra o impulso).
// porAdmin es el admin que lo revisó (vacío si lo confirmó Culqi); cargo es el id del cargo de Culqi.
func ConfirmarPago(ctx context.Context, tx *sql.Tx, id, referencia, porAdmin, cargo string) (int, error) {
	var tid, tipo, concepto, refTienda string
	var planID, productoID sql.NullString
	var monto, dias int
	var admin any
	if porAdmin != "" {
		admin = porAdmin
	}
	err := tx.QueryRowContext(ctx, `UPDATE pagos_plan SET estado='confirmado', referencia=$2, confirmado_por=$3, confirmado_en=now(),
		metodo = CASE WHEN $4 <> '' THEN 'culqi' ELSE metodo END, proveedor = CASE WHEN $4 <> '' THEN 'culqi' ELSE proveedor END
		WHERE id::text=$1 AND estado='pendiente' RETURNING tienda_id, tipo, plan_id, monto_centimos, concepto, producto_id, dias, referencia_tienda`, id, referencia, admin, cargo).
		Scan(&tid, &tipo, &planID, &monto, &concepto, &productoID, &dias, &refTienda)
	if core.SinFilas(err) {
		return 0, httpx.Conflicto("no_aplica", "Este pago ya fue revisado.")
	}
	if err != nil {
		return 0, err
	}
	switch {
	case tipo == "creditos_ia" && cargo == "" && !strings.HasPrefix(refTienda, "chr_"):
		// Solo Culqi: el admin únicamente puede confirmar si hubo un cobro de Culqi que no se llegó a aplicar.
		err = httpx.Conflicto("solo_culqi", "Los créditos de IA solo se pagan con Culqi y este pedido no tiene un cobro de Culqi. Recházalo.")
	case tipo == "creditos_ia":
		err = AplicarCreditosIA(ctx, tx, tid, monto)
	case tipo == "ventas_extra":
		err = AplicarVentasExtra(ctx, tx, tid, monto)
	case tipo == "destacado" && productoID.Valid:
		err = AplicarDestacado(ctx, tx, productoID.String, tid, id, dias)
	case tipo == "destacado":
		err = httpx.Conflicto("sin_producto", "El producto ya no existe. Rechaza el pago y coordina la devolución con la tienda.")
	default:
		err = AplicarPlan(ctx, tx, tid, planID.String, false, monto)
	}
	if err != nil {
		return 0, err
	}
	billetera.Notificar(ctx, tx, tid, "Recibimos tu pago", concepto+": ya está activo. ¡Gracias!", "/vendedor/plan")
	return monto, nil
}

// POST /vendedor/plan/pagos/{id}/culqi {token, email}: la tienda paga con Culqi y se activa al instante.
func (m *Modulo) pagarConCulqi(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	if m.app.Cfg.CulqiSecreta == "" {
		return httpx.Conflicto("sin_culqi", "El pago con Culqi todavía no está disponible.")
	}
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Token string `json:"token"`
		Email string `json:"email"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Token, in.Email = strings.TrimSpace(in.Token), strings.TrimSpace(in.Email)
	if !strings.HasPrefix(in.Token, "tkn_") && !strings.HasPrefix(in.Token, "ype_") {
		return httpx.Invalido("No recibimos los datos de pago de Culqi. Inténtalo de nuevo.")
	}
	if _, err := mail.ParseAddress(in.Email); err != nil {
		return httpx.Invalido("Escribe un correo válido en el formulario de Culqi.")
	}
	id := chi.URLParam(r, "id")
	var concepto string
	var monto int
	err = m.app.DB.QueryRowContext(ctx, `SELECT concepto, monto_centimos FROM pagos_plan WHERE id::text=$1 AND tienda_id=$2 AND estado='pendiente'`, id, tid).Scan(&concepto, &monto)
	if core.SinFilas(err) {
		return httpx.Conflicto("no_aplica", "Este pago ya fue revisado.")
	}
	if err != nil {
		return err
	}
	cargo, err := culqi.Cobrar(ctx, m.app.Cfg.CulqiSecreta, culqi.Cargo{
		Monto: monto, Email: in.Email, Token: in.Token, Descripcion: "VendiGo · " + concepto,
		Metadata: map[string]string{"pago_plan_id": id, "tienda_id": tid},
	})
	var rechazo culqi.ErrRechazado
	if errors.As(err, &rechazo) {
		return httpx.Invalido(rechazo.Mensaje)
	}
	if err != nil {
		return err
	}
	// El cargo ya se cobró: lo confirmamos. Si algo falla aquí, el cargo queda registrado para revisarlo.
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		_, err := ConfirmarPago(ctx, tx, id, cargo, "", cargo)
		return err
	})
	if err != nil {
		m.app.DB.ExecContext(ctx, `UPDATE pagos_plan SET referencia_tienda=$2 WHERE id::text=$1`, id, cargo)
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "¡Pago aprobado! Ya está activo.", "cargo": cargo})
	return nil
}

// cobro: métodos para pagarle a VendiGo, con Culqi primero si está configurado.
func (m *Modulo) cobro(ctx context.Context) CobroVendiGo {
	c := LeerCobro(ctx, m.app.DB)
	if m.app.Cfg.CulqiPublica != "" && m.app.Cfg.CulqiSecreta != "" {
		c.CulqiPublica = m.app.Cfg.CulqiPublica
		c.Metodos = append([]string{"culqi"}, c.Metodos...)
	}
	return c
}
