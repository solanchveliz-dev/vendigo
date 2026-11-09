package billetera

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

type Modulo struct {
	app *core.App
	// Confirmar pide el código de la app o de un SMS antes de mover dinero o cambiar la cuenta bancaria.
	Confirmar func(ctx context.Context, usuarioID, codigo string) error
}

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

func (m *Modulo) RutasVendedor(r chi.Router) {
	r.Method("GET", "/cobros", httpx.Handler(m.cobros))
	r.Method("POST", "/retiros", httpx.Handler(m.retirar))
	r.Method("GET", "/retiros/{id}", httpx.Handler(m.detalleRetiro))
	r.Method("GET", "/cuenta-bancaria", httpx.Handler(m.cuenta))
	r.Method("PUT", "/cuenta-bancaria", httpx.Handler(m.guardarCuenta))
	r.Method("GET", "/verificacion", httpx.Handler(m.verificacion))
	r.Method("POST", "/verificacion", httpx.Handler(m.enviarVerificacion))
}

const retiroMinimo = 1000 // S/ 10

var Bancos = []string{"BCP", "Interbank", "BBVA", "Scotiabank", "BanBif", "Banco de la Nación", "Caja Arequipa", "Caja Huancayo"}

// ---------- Mis cobros ----------

type lineaCobro struct {
	PedidoID  string     `json:"pedido_id"`
	Codigo    string     `json:"codigo"`
	Comprador string     `json:"comprador"`
	Total     int        `json:"total_centimos"`
	Comision  int        `json:"comision_centimos"`
	Neto      int        `json:"neto_centimos"`
	Estado    string     `json:"estado"`
	Texto     string     `json:"texto"`
	LiberarEn *time.Time `json:"liberar_en"`
	Fecha     time.Time  `json:"fecha"`
}

type retiro struct {
	Pedidos  int        `json:"pedidos"`
	ID       string     `json:"id"`
	Monto    int        `json:"monto_centimos"`
	Banco    string     `json:"banco"`
	Ultimos4 string     `json:"ultimos4"`
	Estado   string     `json:"estado"`
	CreadoEn time.Time  `json:"creado_en"`
	PagadoEn *time.Time `json:"pagado_en"`
}

func (m *Modulo) cobros(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	saldos, err := LeerSaldos(ctx, m.app.DB, tid)
	if err != nil {
		return err
	}
	var rep string
	m.app.DB.QueryRowContext(ctx, `SELECT reputacion FROM tiendas WHERE id=$1`, tid).Scan(&rep)

	// Pedidos con dinero pendiente de liberar
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, p.comprador_nombre, p.total_centimos, p.comision_pasarela_centimos, p.estado,
		p.liberar_en, p.creado_en, (SELECT estado FROM reclamos c WHERE c.pedido_id=p.id)
		FROM pedidos p WHERE p.tienda_id=$1 AND p.pago_estado='pagado' AND NOT p.liberado AND p.estado NOT IN ('rechazado','cancelado')
		ORDER BY p.creado_en DESC`, tid)
	if err != nil {
		return err
	}
	aLiberar := []lineaCobro{}
	bloqueado := 0
	for rows.Next() {
		var l lineaCobro
		var reclamo sql.NullString
		rows.Scan(&l.PedidoID, &l.Codigo, &l.Comprador, &l.Total, &l.Comision, &l.Estado, &l.LiberarEn, &l.Fecha, &reclamo)
		l.Neto = l.Total - l.Comision
		switch {
		case reclamo.Valid && (reclamo.String == "abierto" || reclamo.String == "en_revision"):
			l.Texto = "Bloqueado por un reclamo"
			bloqueado += l.Neto
		case l.Estado == "entregado" && l.LiberarEn != nil:
			l.Texto = "Se libera el " + l.LiberarEn.In(lima).Format("02/01")
			if l.LiberarEn.Equal(AbonoPasarela(l.Fecha)) {
				l.Texto += " · cuando Culqi abona"
			}
		default:
			l.Texto = "Espera la entrega · luego " + textoDias(tiendas.DiasLiberacion(rep))
		}
		aLiberar = append(aLiberar, l)
	}
	rows.Close()

	rows, err = m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, p.comprador_nombre, p.total_centimos, p.comision_pasarela_centimos, p.estado,
		p.liberar_en, COALESCE(p.cerrado_en, p.creado_en)
		FROM pedidos p WHERE p.tienda_id=$1 AND p.liberado AND p.retiro_id IS NULL AND p.pago_estado='pagado'
		ORDER BY p.cerrado_en DESC LIMIT 100`, tid)
	if err != nil {
		return err
	}
	liberados := []lineaCobro{}
	for rows.Next() {
		var l lineaCobro
		rows.Scan(&l.PedidoID, &l.Codigo, &l.Comprador, &l.Total, &l.Comision, &l.Estado, &l.LiberarEn, &l.Fecha)
		l.Neto = l.Total - l.Comision
		l.Texto = "Liberado el " + l.Fecha.In(lima).Format("02/01")
		liberados = append(liberados, l)
	}
	rows.Close()

	retiros, err := m.listarRetiros(r, tid)
	if err != nil {
		return err
	}
	var cuenta *string
	var u4 string
	if m.app.DB.QueryRowContext(ctx, `SELECT banco || ' •••• ' || ultimos4, ultimos4 FROM cuentas_bancarias WHERE tienda_id=$1`, tid).Scan(&cuenta, &u4) != nil {
		cuenta = nil
	}
	ver := m.estadoVerificacion(r, tid)
	httpx.OK(w, map[string]any{
		"saldos": saldos, "bloqueado_centimos": bloqueado,
		"reputacion": rep, "dias_liberacion": tiendas.DiasLiberacion(rep),
		"a_liberar": aLiberar, "liberados": liberados, "retiros": retiros,
		"cuenta": cuenta, "verificacion": ver,
		"puede_retirar":          cuenta != nil && ver == "aprobada" && saldos.Disponible >= retiroMinimo,
		"retiro_minimo_centimos": retiroMinimo,
	})
	return nil
}

func textoDias(d int) string {
	switch d {
	case 0:
		return "apenas Culqi abona (2 días hábiles después del pago)"
	case 1:
		return "1 día"
	}
	return fmt.Sprintf("%d días", d)
}

func (m *Modulo) listarRetiros(r *http.Request, tid string) ([]retiro, error) {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT id, monto_centimos, banco, ultimos4, estado, creado_en, pagado_en,
		(SELECT count(*) FROM pedidos p WHERE p.retiro_id=retiros.id) FROM retiros
		WHERE tienda_id=$1 ORDER BY creado_en DESC LIMIT 50`, tid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []retiro{}
	for rows.Next() {
		var x retiro
		rows.Scan(&x.ID, &x.Monto, &x.Banco, &x.Ultimos4, &x.Estado, &x.CreadoEn, &x.PagadoEn, &x.Pedidos)
		out = append(out, x)
	}
	return out, nil
}

func (m *Modulo) retirar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	if m.estadoVerificacion(r, tid) != "aprobada" {
		return httpx.Conflicto("sin_verificacion", "Para retirar primero verifica tu identidad.")
	}
	var in struct {
		Codigo string `json:"codigo"`
	}
	if r.ContentLength > 0 {
		if err := httpx.Leer(r, &in); err != nil {
			return err
		}
	}
	if err := m.confirmar(ctx, in.Codigo); err != nil {
		return err
	}
	var id string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		// Bloquea la tienda para que dos retiros a la vez no usen el mismo saldo.
		if _, err := tx.ExecContext(ctx, `SELECT 1 FROM tiendas WHERE id=$1 FOR UPDATE`, tid); err != nil {
			return err
		}
		var banco, u4 string
		if err := tx.QueryRowContext(ctx, `SELECT banco, ultimos4 FROM cuentas_bancarias WHERE tienda_id=$1`, tid).Scan(&banco, &u4); err != nil {
			return httpx.Conflicto("sin_cuenta", "Agrega la cuenta bancaria donde quieres recibir tu dinero.")
		}
		s, err := LeerSaldos(ctx, tx, tid)
		if err != nil {
			return err
		}
		// Se retira todo lo disponible, como en el prototipo ("Retirar a mi cuenta").
		monto := s.Disponible
		if monto < retiroMinimo {
			return httpx.Invalido("El retiro mínimo es S/ 10.")
		}
		if err := tx.QueryRowContext(ctx, `INSERT INTO retiros (tienda_id, monto_centimos, banco, ultimos4) VALUES ($1,$2,$3,$4) RETURNING id`,
			tid, monto, banco, u4).Scan(&id); err != nil {
			return err
		}
		if err := mover(ctx, tx, tid, nil, id, "retiro", "disponible", -monto, "Retiro a "+banco+" •••• "+u4); err != nil {
			return err
		}
		if err := mover(ctx, tx, tid, nil, id, "retiro", "retirado", monto, "Retiro a "+banco+" •••• "+u4); err != nil {
			return err
		}
		// Los pedidos liberados que entran en este retiro.
		if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET retiro_id=$2 WHERE tienda_id=$1 AND liberado AND retiro_id IS NULL AND pago_estado='pagado'`, tid, id); err != nil {
			return err
		}
		u, _ := httpx.UsuarioDe(ctx)
		m.app.Auditar(ctx, tx, u.ID, "retiro", "retiro", id, map[string]int{"monto": monto})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]any{"id": id, "mensaje": "Listo. El dinero llega a tu cuenta en hasta 2 días hábiles."})
	return nil
}

// detalleRetiro: resumen del retiro y los pedidos que incluye.
func (m *Modulo) detalleRetiro(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var x retiro
	var operacion, motivo string
	err = m.app.DB.QueryRowContext(ctx, `SELECT id, monto_centimos, banco, ultimos4, estado, creado_en, pagado_en, operacion, motivo_rechazo FROM retiros WHERE id::text=$1 AND tienda_id=$2`,
		chi.URLParam(r, "id"), tid).Scan(&x.ID, &x.Monto, &x.Banco, &x.Ultimos4, &x.Estado, &x.CreadoEn, &x.PagadoEn, &operacion, &motivo)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id, codigo, comprador_nombre, total_centimos, comision_pasarela_centimos, COALESCE(cerrado_en, creado_en)
		FROM pedidos WHERE retiro_id=$1 ORDER BY cerrado_en`, x.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	lineas := []lineaCobro{}
	total, comision := 0, 0
	for rows.Next() {
		var l lineaCobro
		rows.Scan(&l.PedidoID, &l.Codigo, &l.Comprador, &l.Total, &l.Comision, &l.Fecha)
		l.Neto = l.Total - l.Comision
		total, comision = total+l.Total, comision+l.Comision
		lineas = append(lineas, l)
	}
	x.Pedidos = len(lineas)
	// El número de operación lo registra el administrador al hacer la transferencia.
	httpx.OK(w, map[string]any{"retiro": x, "pedidos": lineas, "pagaron_centimos": total, "culqi_centimos": comision,
		"operacion": operacion, "motivo_rechazo": motivo})
	return nil
}

// ---------- cuenta bancaria ----------

var (
	reCuenta = regexp.MustCompile(`^\d{10,20}$`)
	reCCI    = regexp.MustCompile(`^\d{20}$`)
)

func (m *Modulo) cuenta(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var c struct {
		Banco    string `json:"banco"`
		Titular  string `json:"titular"`
		Tipo     string `json:"tipo"`
		Ultimos4 string `json:"ultimos4"`
	}
	err = m.app.DB.QueryRowContext(ctx, `SELECT banco, titular, tipo, ultimos4 FROM cuentas_bancarias WHERE tienda_id=$1`, tid).
		Scan(&c.Banco, &c.Titular, &c.Tipo, &c.Ultimos4)
	if core.SinFilas(err) {
		httpx.OK(w, map[string]any{"cuenta": nil, "bancos": Bancos})
		return nil
	}
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"cuenta": c, "bancos": Bancos})
	return nil
}

func (m *Modulo) guardarCuenta(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Banco   string `json:"banco"`
		Titular string `json:"titular"`
		Tipo    string `json:"tipo"`
		Numero  string `json:"numero"`
		CCI     string `json:"cci"`
		Codigo  string `json:"codigo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	limpio := func(s string) string { return strings.NewReplacer(" ", "", "-", "").Replace(s) }
	in.Numero, in.CCI, in.Titular = limpio(in.Numero), limpio(in.CCI), strings.TrimSpace(in.Titular)
	if !slices.Contains(Bancos, in.Banco) {
		return httpx.Invalido("Elige tu banco.")
	}
	if in.Tipo != "ahorros" && in.Tipo != "corriente" {
		return httpx.Invalido("Elige el tipo de cuenta.")
	}
	if len([]rune(in.Titular)) < 5 {
		return httpx.Invalido("Escribe el nombre del titular tal como figura en el banco.")
	}
	if !reCuenta.MatchString(in.Numero) {
		return httpx.Invalido("El número de cuenta debe tener solo números (entre 10 y 20).")
	}
	if !reCCI.MatchString(in.CCI) {
		return httpx.Invalido("El CCI tiene 20 dígitos.")
	}
	// Cambiar a dónde llega el dinero es delicado: se confirma con un código.
	if err := m.confirmar(ctx, in.Codigo); err != nil {
		return err
	}
	num, err := m.app.Cifrador.Cifrar(in.Numero)
	if err != nil {
		return err
	}
	cci, err := m.app.Cifrador.Cifrar(in.CCI)
	if err != nil {
		return err
	}
	u4 := in.Numero[len(in.Numero)-4:]
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO cuentas_bancarias (tienda_id, banco, titular, tipo, numero_cifrado, cci_cifrado, ultimos4)
		VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tienda_id) DO UPDATE SET banco=$2, titular=$3, tipo=$4, numero_cifrado=$5,
		cci_cifrado=$6, ultimos4=$7, actualizado_en=now()`, tid, in.Banco, in.Titular, in.Tipo, num, cci, u4); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(ctx)
	m.app.Auditar(ctx, m.app.DB, u.ID, "cuenta_bancaria", "tienda", tid, map[string]string{"banco": in.Banco, "ultimos4": u4})
	Notificar(ctx, m.app.DB, tid, "Se guardó tu cuenta bancaria", "Tus retiros llegarán a "+in.Banco+" •••• "+u4+". Si no fuiste tú, escríbenos de inmediato.", "/vendedor/cuenta-bancaria")
	return m.cuenta(w, r)
}

// ---------- verificación de identidad ----------

func (m *Modulo) estadoVerificacion(r *http.Request, tid string) string {
	var e string
	if m.app.DB.QueryRowContext(r.Context(), `SELECT estado FROM verificaciones WHERE tienda_id=$1 ORDER BY creado_en DESC LIMIT 1`, tid).Scan(&e) != nil {
		return "sin_enviar"
	}
	return e
}

func (m *Modulo) verificacion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var v struct {
		Estado   string    `json:"estado"`
		Tipo     string    `json:"tipo_documento"`
		Ultimos4 string    `json:"ultimos4"`
		Nombre   string    `json:"nombre_completo"`
		Motivo   string    `json:"motivo_rechazo"`
		CreadoEn time.Time `json:"creado_en"`
	}
	err = m.app.DB.QueryRowContext(ctx, `SELECT estado, tipo_documento, ultimos4, nombre_completo, motivo_rechazo, creado_en
		FROM verificaciones WHERE tienda_id=$1 ORDER BY creado_en DESC LIMIT 1`, tid).Scan(&v.Estado, &v.Tipo, &v.Ultimos4, &v.Nombre, &v.Motivo, &v.CreadoEn)
	if core.SinFilas(err) {
		httpx.OK(w, map[string]any{"estado": "sin_enviar"})
		return nil
	}
	if err != nil {
		return err
	}
	httpx.OK(w, v)
	return nil
}

var reDoc = map[string]*regexp.Regexp{"dni": regexp.MustCompile(`^\d{8}$`), "ruc": regexp.MustCompile(`^(10|20)\d{9}$`), "ce": regexp.MustCompile(`^\d{9,12}$`)}

func (m *Modulo) enviarVerificacion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Tipo       string `json:"tipo_documento"`
		Numero     string `json:"numero"`
		Nombre     string `json:"nombre_completo"`
		FrenteKey  string `json:"frente_key"`
		ReversoKey string `json:"reverso_key"`
		SelfieKey  string `json:"selfie_key"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	re, ok := reDoc[in.Tipo]
	if !ok {
		return httpx.Invalido("Elige el tipo de documento.")
	}
	in.Numero = strings.TrimSpace(in.Numero)
	if !re.MatchString(in.Numero) {
		return httpx.Invalido("El número de documento no es válido.")
	}
	if len([]rune(strings.TrimSpace(in.Nombre))) < 5 {
		return httpx.Invalido("Escribe tu nombre completo como figura en tu documento.")
	}
	pref := "dni/" + tid + "/"
	if !strings.HasPrefix(in.FrenteKey, pref) || !strings.HasPrefix(in.SelfieKey, pref) || (in.ReversoKey != "" && !strings.HasPrefix(in.ReversoKey, pref)) {
		return httpx.Invalido("Sube las fotos del documento y tu selfie.")
	}
	if m.estadoVerificacion(r, tid) == "pendiente" || m.estadoVerificacion(r, tid) == "aprobada" {
		return httpx.Conflicto("verificacion_existe", "Tu verificación ya fue enviada.")
	}
	num, err := m.app.Cifrador.Cifrar(in.Numero)
	if err != nil {
		return err
	}
	var reverso any
	if in.ReversoKey != "" {
		reverso = in.ReversoKey
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO verificaciones (tienda_id, tipo_documento, numero_cifrado, ultimos4, nombre_completo, frente_key, reverso_key, selfie_key)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, tid, in.Tipo, num, in.Numero[len(in.Numero)-4:], strings.TrimSpace(in.Nombre), in.FrenteKey, reverso, in.SelfieKey); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(ctx)
	m.app.Auditar(ctx, m.app.DB, u.ID, "enviar_verificacion", "tienda", tid, nil)
	return m.verificacion(w, r)
}

func (m *Modulo) confirmar(ctx context.Context, codigo string) error {
	if m.Confirmar == nil {
		return nil
	}
	u, _ := httpx.UsuarioDe(ctx)
	return m.Confirmar(ctx, u.ID, codigo)
}
