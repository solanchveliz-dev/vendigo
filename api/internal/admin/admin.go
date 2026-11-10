// Package admin es el panel del administrador de VendiGo: supervisa a las vendedoras,
// revisa identidades, modera tiendas y productos, da seguimiento a pedidos y resuelve reclamos.
// Cada acción queda en la auditoría con quién la hizo.
package admin

import (
	"context"
	"database/sql"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

type Modulo struct {
	app *core.App
	// EnviarCodigo envía un código por SMS (lo pone auth: así el admin no duplica esa lógica).
	EnviarCodigo func(ctx context.Context, celular, proposito string) (string, error)
}

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

// Rutas se montan en /admin (requieren rol admin).
func (m *Modulo) Rutas(r chi.Router) {
	r.Method("GET", "/resumen", httpx.Handler(m.resumen))
	r.Method("GET", "/panel", httpx.Handler(m.panel))
	r.Method("GET", "/seguridad", httpx.Handler(m.seguridad))
	r.Method("PUT", "/ajustes", httpx.Handler(m.guardarAjustes))
	r.Method("GET", "/notificaciones", httpx.Handler(m.notificaciones))
	r.Method("GET", "/vendedores", httpx.Handler(m.vendedores))
	r.Method("GET", "/vendedores/{id}", httpx.Handler(m.vendedor))
	r.Method("POST", "/vendedores/{id}/suspender", httpx.Handler(m.suspender))
	r.Method("POST", "/vendedores/{id}/reactivar", httpx.Handler(m.reactivar))
	r.Method("GET", "/verificaciones", httpx.Handler(m.verificaciones))
	r.Method("GET", "/verificaciones/{id}", httpx.Handler(m.verificacion))
	r.Method("POST", "/verificaciones/{id}/aprobar", httpx.Handler(m.aprobar))
	r.Method("POST", "/verificaciones/{id}/rechazar", httpx.Handler(m.rechazar))
	r.Method("GET", "/reclamos", httpx.Handler(m.reclamos))
	r.Method("POST", "/reclamos/{id}/resolver", httpx.Handler(m.resolverReclamo))
	r.Method("GET", "/auditoria", httpx.Handler(m.auditoria))
	r.Method("GET", "/usuarios", httpx.Handler(m.usuarios))
	r.Method("GET", "/usuarios/{id}", httpx.Handler(m.usuario))
	r.Method("POST", "/usuarios/{id}/suspender", httpx.Handler(m.suspender))
	r.Method("POST", "/usuarios/{id}/reactivar", httpx.Handler(m.reactivar))
	r.Method("POST", "/usuarios/{id}/cambio-password", httpx.Handler(m.cambioPassword))
	r.Method("POST", "/usuarios/{id}/mensaje", httpx.Handler(m.mensaje))
	r.Method("GET", "/tiendas", httpx.Handler(m.tiendas))
	r.Method("GET", "/tiendas/{id}", httpx.Handler(m.tienda))
	r.Method("POST", "/tiendas/{id}/aprobar", httpx.Handler(m.aprobarTienda))
	r.Method("POST", "/tiendas/{id}/suspender", httpx.Handler(m.suspenderTienda))
	r.Method("POST", "/tiendas/{id}/reactivar", httpx.Handler(m.reactivarTienda))
	r.Method("GET", "/productos", httpx.Handler(m.productos))
	r.Method("GET", "/productos/{id}", httpx.Handler(m.producto))
	r.Method("POST", "/productos/{id}/retirar", httpx.Handler(m.retirarProducto))
	r.Method("POST", "/productos/{id}/restaurar", httpx.Handler(m.restaurarProducto))
	r.Method("GET", "/pedidos", httpx.Handler(m.pedidosAdmin))
	r.Method("GET", "/pedidos/{id}", httpx.Handler(m.pedidoAdmin))
	r.Method("GET", "/pagos", httpx.Handler(m.pagos))
	r.Method("GET", "/suscripciones", httpx.Handler(m.suscripciones))
	r.Method("GET", "/pagos-plan", httpx.Handler(m.pagosPlan))
	r.Method("GET", "/garantias", httpx.Handler(m.garantias))
	r.Method("POST", "/garantias/{pedido}/pagar", httpx.Handler(m.pagarGarantia))
	r.Method("POST", "/garantias/{id}/reactivar", httpx.Handler(m.reactivarTiendaFondo))
	r.Method("POST", "/pagos-plan/{id}/confirmar", httpx.Handler(m.confirmarPagoPlan))
	r.Method("POST", "/pagos-plan/{id}/rechazar", httpx.Handler(m.rechazarPagoPlan))
	r.Method("GET", "/planes", httpx.Handler(m.planes))
	r.Method("PUT", "/planes/{id}", httpx.Handler(m.guardarPlan))
	r.Method("GET", "/reportes", httpx.Handler(m.reportes))
	r.Method("GET", "/reportes/csv", httpx.Handler(m.reporteCSV))
	r.Method("GET", "/incidencias", httpx.Handler(m.incidencias))
	r.Method("POST", "/incidencias", httpx.Handler(m.crearIncidencia))
	r.Method("GET", "/incidencias/{n}", httpx.Handler(m.incidencia))
	r.Method("POST", "/incidencias/{n}/estado", httpx.Handler(m.estadoIncidencia))
	r.Method("POST", "/incidencias/{n}/nota", httpx.Handler(m.notaIncidencia))
	r.Method("GET", "/agencias", httpx.Handler(m.agencias))
	r.Method("POST", "/agencias", httpx.Handler(m.guardarSede))
	r.Method("PUT", "/agencias/{id}", httpx.Handler(m.guardarSede))
	r.Method("POST", "/agencias/{id}/estado", httpx.Handler(m.activarSede))
	r.Method("GET", "/configuracion", httpx.Handler(m.configuracion))
	r.Method("PUT", "/configuracion", httpx.Handler(m.guardarConfiguracion))
	r.Method("GET", "/bandeja", httpx.Handler(m.bandeja))
	r.Method("POST", "/bandeja/leer", httpx.Handler(m.leerAviso))
	r.Method("POST", "/bandeja/{id}/leer", httpx.Handler(m.leerAviso))
}

func adminID(ctx context.Context) string {
	u, _ := httpx.UsuarioDe(ctx)
	return u.ID
}

func (m *Modulo) urlPrivada(ctx context.Context, key string) string {
	if key == "" {
		return ""
	}
	u, _ := m.app.Archivos.URLLectura(ctx, key)
	return u
}

func motivoObligatorio(r *http.Request) (string, error) {
	var in struct {
		Motivo string `json:"motivo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return "", err
	}
	in.Motivo = strings.TrimSpace(in.Motivo)
	if len([]rune(in.Motivo)) < 5 {
		return "", httpx.Invalido("Escribe el motivo (se le muestra a la vendedora).")
	}
	if len([]rune(in.Motivo)) > 300 {
		return "", httpx.Invalido("El motivo puede tener hasta 300 caracteres.")
	}
	return in.Motivo, nil
}

// ---------- resumen ----------

func (m *Modulo) resumen(w http.ResponseWriter, r *http.Request) error {
	var d struct {
		Vendedoras     int `json:"vendedoras"`
		Suspendidas    int `json:"suspendidas"`
		NuevasSemana   int `json:"nuevas_semana"`
		Verificaciones int `json:"verificaciones_pendientes"`
		PagosPlan      int `json:"pagos_plan_pendientes"`
		Reclamos       int `json:"reclamos_abiertos"`
		Bloqueos       int `json:"cuentas_bloqueadas"`
		Incidencias    int `json:"incidencias_abiertas"`
	}
	err := m.app.DB.QueryRowContext(r.Context(), `SELECT
		(SELECT count(*) FROM usuarios WHERE rol='vendedor'),
		(SELECT count(*) FROM usuarios WHERE rol='vendedor' AND NOT activo),
		(SELECT count(*) FROM usuarios WHERE rol='vendedor' AND creado_en > now() - interval '7 days'),
		(SELECT count(*) FROM verificaciones WHERE estado='pendiente'),
		(SELECT count(*) FROM pagos_plan WHERE estado='pendiente' AND referencia_tienda LIKE 'chr\_%'), -- cobrados por Culqi sin activar
		(SELECT count(*) FROM reclamos WHERE estado IN ('abierto','en_revision')),
		(SELECT count(*) FROM usuarios WHERE bloqueado_hasta > now()),
		(SELECT count(*) FROM incidencias WHERE estado<>'resuelta')`).
		Scan(&d.Vendedoras, &d.Suspendidas, &d.NuevasSemana, &d.Verificaciones, &d.PagosPlan, &d.Reclamos, &d.Bloqueos, &d.Incidencias)
	if err != nil {
		return err
	}
	httpx.OK(w, d)
	return nil
}

// ---------- vendedoras ----------

type Vendedora struct {
	ID           string     `json:"id"`
	Nombre       string     `json:"nombre"`
	Celular      string     `json:"celular"`
	Email        string     `json:"email"`
	Activo       bool       `json:"activo"`
	Motivo       string     `json:"suspendido_motivo"`
	Bloqueada    bool       `json:"bloqueada"`
	CreadoEn     time.Time  `json:"creado_en"`
	TiendaID     string     `json:"tienda_id"`
	Tienda       string     `json:"tienda"`
	Slug         string     `json:"slug"`
	Plan         string     `json:"plan"`
	Verificacion string     `json:"verificacion"`
	Pedidos      int        `json:"pedidos"`
	Ventas       int        `json:"ventas_centimos"`
	UltimoAcceso *time.Time `json:"ultimo_acceso"`
	Reputacion   string     `json:"reputacion"`
	RUCPendiente bool       `json:"ruc_pendiente"` // envió su RUC y espera revisión
}

const consultaVendedoras = `SELECT u.id, u.nombre, u.celular, COALESCE(u.email,''), u.activo, u.suspendido_motivo,
	COALESCE(u.bloqueado_hasta > now(), false), u.creado_en,
	COALESCE(t.id::text,''), COALESCE(t.nombre,''), COALESCE(t.slug,''),
	COALESCE((SELECT p.nombre FROM suscripciones s JOIN planes p ON p.id=s.plan_id WHERE s.tienda_id=t.id AND s.activa LIMIT 1),''),
	COALESCE((SELECT v.estado FROM verificaciones v WHERE v.tienda_id=t.id AND v.clase='identidad' ORDER BY v.creado_en DESC LIMIT 1),'sin_enviar'),
	(SELECT count(*) FROM pedidos p WHERE p.tienda_id=t.id AND p.estado NOT IN ('rechazado','cancelado')),
	COALESCE((SELECT SUM(total_centimos) FROM pedidos p WHERE p.tienda_id=t.id AND p.estado='entregado'),0),
	(SELECT max(a.creado_en) FROM accesos a WHERE a.usuario_id=u.id AND a.exito), COALESCE(t.reputacion,''),
	EXISTS (SELECT 1 FROM verificaciones v WHERE v.tienda_id=t.id AND v.clase='negocio' AND v.estado='pendiente')
	FROM usuarios u LEFT JOIN tiendas t ON t.usuario_id=u.id
	WHERE u.rol='vendedor'`

func scanVendedora(s interface{ Scan(...any) error }) (Vendedora, error) {
	var v Vendedora
	err := s.Scan(&v.ID, &v.Nombre, &v.Celular, &v.Email, &v.Activo, &v.Motivo, &v.Bloqueada, &v.CreadoEn,
		&v.TiendaID, &v.Tienda, &v.Slug, &v.Plan, &v.Verificacion, &v.Pedidos, &v.Ventas, &v.UltimoAcceso, &v.Reputacion, &v.RUCPendiente)
	return v, err
}

func (m *Modulo) vendedores(w http.ResponseWriter, r *http.Request) error {
	q := "%" + strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q"))) + "%"
	filtro := ""
	switch r.URL.Query().Get("estado") {
	case "activas":
		filtro = " AND u.activo"
	case "suspendidas":
		filtro = " AND NOT u.activo"
	}
	rows, err := m.app.DB.QueryContext(r.Context(), consultaVendedoras+filtro+`
		AND (lower(u.nombre) LIKE $1 OR u.celular LIKE $1 OR lower(COALESCE(u.email,'')) LIKE $1 OR lower(COALESCE(t.nombre,'')) LIKE $1)
		ORDER BY u.creado_en DESC LIMIT 200`, q)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Vendedora{}
	for rows.Next() {
		v, err := scanVendedora(rows)
		if err != nil {
			return err
		}
		out = append(out, v)
	}
	httpx.OK(w, map[string]any{"vendedoras": out})
	return nil
}

func (m *Modulo) vendedor(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	v, err := scanVendedora(m.app.DB.QueryRowContext(ctx, consultaVendedoras+` AND u.id::text=$1`, id))
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}

	type acceso struct {
		Exito  bool      `json:"exito"`
		Motivo string    `json:"motivo"`
		IP     string    `json:"ip"`
		Agente string    `json:"agente"`
		Fecha  time.Time `json:"creado_en"`
	}
	accesos := []acceso{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT exito, motivo, ip, agente, creado_en FROM accesos WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 10`, v.ID); err == nil {
		for rows.Next() {
			var a acceso
			rows.Scan(&a.Exito, &a.Motivo, &a.IP, &a.Agente, &a.Fecha)
			accesos = append(accesos, a)
		}
		rows.Close()
	}

	historial := []Evento{}
	if rows, err := m.app.DB.QueryContext(ctx, consultaAuditoria+` WHERE a.usuario_id::text=$1 OR a.entidad_id=$1 OR a.entidad_id=$2
		ORDER BY a.creado_en DESC LIMIT 20`, v.ID, v.TiendaID); err == nil {
		historial = leerEventos(rows)
	}

	// Ventas informativas de la tienda (VendiGo no guarda su dinero, así que no hay saldos).
	var ventas struct {
		Vendido      int `json:"vendido_centimos"`
		Entregados   int `json:"pedidos_entregados"`
		PorConfirmar int `json:"pagos_por_confirmar"`
		Devoluciones int `json:"devoluciones_pendientes"`
	}
	type pagoPlan struct {
		Concepto string    `json:"concepto"`
		Monto    int       `json:"monto_centimos"`
		Estado   string    `json:"estado"`
		Fecha    time.Time `json:"creado_en"`
	}
	pagos := []pagoPlan{}
	var extra struct {
		Ciudad     string     `json:"ciudad"`
		Entrega    []string   `json:"entrega"`
		Reputacion string     `json:"reputacion"`
		Reclamos   int        `json:"reclamos"`
		Perdidos   int        `json:"reclamos_perdidos"`
		PlanDesde  *time.Time `json:"plan_desde"`
		VerifID    string     `json:"verificacion_id"`
		RUCID      string     `json:"verificacion_ruc_id"`
		RUCEstado  string     `json:"ruc"`
	}
	extra.Entrega = []string{}
	if v.TiendaID != "" {
		m.app.DB.QueryRowContext(ctx, `SELECT COALESCE(SUM(p.total_centimos) FILTER (WHERE p.estado='entregado'),0), count(*) FILTER (WHERE p.estado='entregado'),
			count(*) FILTER (WHERE g.estado IN ('pendiente','comprobante_enviado','no_recibido') AND p.estado NOT IN ('rechazado','cancelado')),
			(SELECT count(*) FROM devoluciones d JOIN pedidos x ON x.id=d.pedido_id WHERE x.tienda_id=$1 AND d.estado='pendiente_tienda')
			FROM pedidos p JOIN pagos g ON g.pedido_id=p.id WHERE p.tienda_id=$1`, v.TiendaID).Scan(&ventas.Vendido, &ventas.Entregados, &ventas.PorConfirmar, &ventas.Devoluciones)
		var recojo, agencia, moto, otra bool
		m.app.DB.QueryRowContext(ctx, `SELECT COALESCE(NULLIF(distrito,'')||', '||ciudad, ciudad), entrega_recojo, entrega_agencia, entrega_motorizado, entrega_otra, reputacion,
			(SELECT count(*) FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id WHERE p.tienda_id=t.id),
			(SELECT count(*) FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id WHERE p.tienda_id=t.id AND c.estado='a_favor_comprador'),
			(SELECT inicio FROM suscripciones s WHERE s.tienda_id=t.id AND s.activa LIMIT 1),
			COALESCE((SELECT v.id::text FROM verificaciones v WHERE v.tienda_id=t.id AND v.clase='identidad' ORDER BY v.creado_en DESC LIMIT 1),''),
			COALESCE((SELECT v.id::text FROM verificaciones v WHERE v.tienda_id=t.id AND v.clase='negocio' ORDER BY v.creado_en DESC LIMIT 1),''),
			COALESCE((SELECT v.estado FROM verificaciones v WHERE v.tienda_id=t.id AND v.clase='negocio' ORDER BY v.creado_en DESC LIMIT 1),'sin_enviar')
			FROM tiendas t WHERE t.id=$1`, v.TiendaID).
			Scan(&extra.Ciudad, &recojo, &agencia, &moto, &otra, &extra.Reputacion, &extra.Reclamos, &extra.Perdidos, &extra.PlanDesde, &extra.VerifID, &extra.RUCID, &extra.RUCEstado)
		for _, e := range []struct {
			ok bool
			t  string
		}{{recojo, "Recojo"}, {agencia, "Agencia"}, {moto, "Motorizado"}, {otra, "Otra"}} {
			if e.ok {
				extra.Entrega = append(extra.Entrega, e.t)
			}
		}
		if rows, err := m.app.DB.QueryContext(ctx, `SELECT concepto, monto_centimos, estado, creado_en FROM pagos_plan WHERE tienda_id=$1 ORDER BY creado_en DESC LIMIT 6`, v.TiendaID); err == nil {
			for rows.Next() {
				var x pagoPlan
				rows.Scan(&x.Concepto, &x.Monto, &x.Estado, &x.Fecha)
				pagos = append(pagos, x)
			}
			rows.Close()
		}
	}
	httpx.OK(w, map[string]any{"vendedora": v, "accesos": accesos, "historial": historial, "ventas": ventas, "tienda": extra, "pagos_plan": pagos})
	return nil
}

func (m *Modulo) suspender(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	motivo, err := motivoObligatorio(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE usuarios SET activo=false, suspendido_motivo=$2 WHERE id::text=$1 AND rol<>'admin' AND activo`, id, motivo)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return httpx.Conflicto("no_aplica", "La cuenta no existe o ya está suspendida.")
		}
		// Su tienda deja de verse y de recibir pedidos mientras esté suspendida.
		if _, err := tx.ExecContext(ctx, `UPDATE tiendas SET activa=false WHERE usuario_id::text=$1`, id); err != nil {
			return err
		}
		// Se cierran todas sus sesiones: no podrá renovar su acceso.
		if _, err := tx.ExecContext(ctx, `UPDATE refresh_tokens SET revocado=true WHERE usuario_id::text=$1 AND NOT revocado`, id); err != nil {
			return err
		}
		m.app.Auditar(ctx, tx, adminID(ctx), "suspender_cuenta", "usuario", id, map[string]string{"motivo": motivo})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Cuenta suspendida. Se cerraron sus sesiones."})
	return nil
}

func (m *Modulo) reactivar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	// Reactiva una cuenta suspendida o quita el bloqueo temporal por intentos fallidos.
	res, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET activo=true, suspendido_motivo='', intentos_fallidos=0, bloqueado_hasta=NULL
		WHERE id::text=$1 AND rol<>'admin' AND (NOT activo OR bloqueado_hasta > now())`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.Conflicto("no_aplica", "La cuenta no existe o ya está activa.")
	}
	// La tienda vuelve a verse, salvo que el admin la haya suspendido aparte.
	m.app.DB.ExecContext(ctx, `UPDATE tiendas SET activa=true WHERE usuario_id::text=$1 AND suspendida_motivo=''`, id)
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "reactivar_cuenta", "usuario", id, nil)
	httpx.OK(w, map[string]string{"mensaje": "Cuenta reactivada."})
	return nil
}

// ---------- verificación de identidad ----------

type Verificacion struct {
	ID        string     `json:"id"`
	TiendaID  string     `json:"tienda_id"`
	Tienda    string     `json:"tienda"`
	UsuarioID string     `json:"usuario_id"`
	Titular   string     `json:"titular_cuenta"`
	Tipo      string     `json:"tipo_documento"`
	Clase     string     `json:"clase"` // identidad (DNI/CE, obligatoria para mostrarse) o negocio (RUC, insignia)
	Ultimos4  string     `json:"ultimos4"`
	Nombre    string     `json:"nombre_completo"`
	Estado    string     `json:"estado"`
	Motivo    string     `json:"motivo_rechazo"`
	CreadoEn  time.Time  `json:"creado_en"`
	Revisado  *time.Time `json:"revisado_en"`
	Numero    string     `json:"numero,omitempty"`
	Frente    string     `json:"frente_url,omitempty"`
	Reverso   string     `json:"reverso_url,omitempty"`
	Selfie    string     `json:"selfie_url,omitempty"`
}

const consultaVerif = `SELECT v.id, v.tienda_id, t.nombre, u.id, u.nombre, v.tipo_documento, v.clase, v.ultimos4, v.nombre_completo, v.estado,
	v.motivo_rechazo, v.creado_en, v.revisado_en FROM verificaciones v JOIN tiendas t ON t.id=v.tienda_id JOIN usuarios u ON u.id=t.usuario_id`

func scanVerif(s interface{ Scan(...any) error }) (Verificacion, error) {
	var v Verificacion
	err := s.Scan(&v.ID, &v.TiendaID, &v.Tienda, &v.UsuarioID, &v.Titular, &v.Tipo, &v.Clase, &v.Ultimos4, &v.Nombre, &v.Estado, &v.Motivo, &v.CreadoEn, &v.Revisado)
	return v, err
}

func (m *Modulo) verificaciones(w http.ResponseWriter, r *http.Request) error {
	estado := r.URL.Query().Get("estado")
	if estado == "" {
		estado = "pendiente"
	}
	rows, err := m.app.DB.QueryContext(r.Context(), consultaVerif+` WHERE v.estado=$1 OR $1='todas' ORDER BY v.creado_en DESC LIMIT 100`, estado)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Verificacion{}
	for rows.Next() {
		v, err := scanVerif(rows)
		if err != nil {
			return err
		}
		out = append(out, v)
	}
	httpx.OK(w, map[string]any{"verificaciones": out})
	return nil
}

func (m *Modulo) verificacion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	v, err := scanVerif(m.app.DB.QueryRowContext(ctx, consultaVerif+` WHERE v.id::text=$1`, id))
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	var cifrado, frente, selfie string
	var reverso *string
	m.app.DB.QueryRowContext(ctx, `SELECT numero_cifrado, frente_key, reverso_key, COALESCE(selfie_key, '') FROM verificaciones WHERE id=$1`, v.ID).Scan(&cifrado, &frente, &reverso, &selfie)
	if m.app.Cifrador != nil {
		v.Numero, _ = m.app.Cifrador.Descifrar(cifrado)
	}
	v.Frente = m.urlPrivada(ctx, frente)
	v.Selfie = m.urlPrivada(ctx, selfie) // la ficha RUC no lleva selfie: queda vacío
	if reverso != nil {
		v.Reverso = m.urlPrivada(ctx, *reverso)
	}
	// Ver el documento completo queda registrado.
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "ver_documento", "verificacion", v.ID, nil)
	httpx.OK(w, v)
	return nil
}

func (m *Modulo) aprobar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var tid, clase string
		err := tx.QueryRowContext(ctx, `UPDATE verificaciones SET estado='aprobada', motivo_rechazo='', revisado_en=now(), revisado_por=$2
			WHERE id::text=$1 AND estado='pendiente' RETURNING tienda_id, clase`, id, adminID(ctx)).Scan(&tid, &clase)
		if core.SinFilas(err) {
			return httpx.Conflicto("ya_revisada", "Esta verificación ya se revisó o no existe.")
		}
		if err != nil {
			return err
		}
		if clase == "negocio" {
			billetera.Notificar(ctx, tx, tid, "Verificamos tu RUC", "Tu tienda ya muestra la insignia «Negocio con RUC verificado».", "/vendedor/verificacion")
		} else {
			billetera.Notificar(ctx, tx, tid, "Verificamos tu identidad", "El equipo de VendiGo aprobó tus datos. Tu tienda ya es visible para los compradores.", "/vendedor")
			billetera.SMSTienda(ctx, tx, tid, "Verificamos tu identidad. Tu tienda ya es visible para los compradores:", "/vendedor")
		}
		m.app.Auditar(ctx, tx, adminID(ctx), "aprobar_identidad", "verificacion", id, nil)
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Identidad aprobada."})
	return nil
}

func (m *Modulo) rechazar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	motivo, err := motivoObligatorio(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var tid string
		err := tx.QueryRowContext(ctx, `UPDATE verificaciones SET estado='rechazada', motivo_rechazo=$2, revisado_en=now(), revisado_por=$3
			WHERE id::text=$1 AND estado='pendiente' RETURNING tienda_id`, id, motivo, adminID(ctx)).Scan(&tid)
		if core.SinFilas(err) {
			return httpx.Conflicto("ya_revisada", "Esta verificación ya se revisó o no existe.")
		}
		if err != nil {
			return err
		}
		billetera.Notificar(ctx, tx, tid, "No pudimos verificar tu identidad", motivo+" Vuelve a enviar tus fotos.", "/vendedor/verificacion")
		billetera.SMSTienda(ctx, tx, tid, "No pudimos verificar tus datos. Revisa el motivo y vuelve a enviarlos:", "/vendedor/verificacion")
		m.app.Auditar(ctx, tx, adminID(ctx), "rechazar_identidad", "verificacion", id, map[string]string{"motivo": motivo})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Verificación rechazada. Le avisamos a la vendedora."})
	return nil
}

// ---------- reclamos ----------

func (m *Modulo) reclamos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	abiertos := r.URL.Query().Get("estado") != "todos"
	rows, err := m.app.DB.QueryContext(ctx, `SELECT c.id, p.id, p.codigo, t.nombre, p.comprador_nombre, p.total_centimos, c.motivo, c.descripcion,
		c.fotos, COALESCE(c.respuesta_vendedor,''), c.evidencias, c.estado, c.nota_admin, c.creado_en, c.respondido_en, c.resuelto_en, COALESCE((SELECT d.estado FROM devoluciones d WHERE d.pedido_id=p.id ORDER BY d.creado_en DESC LIMIT 1),''),
		p.entrega, COALESCE(e.agencia,''), COALESCE(e.numero_orden,''), e.boleta_key IS NOT NULL, t.reputacion,
		(SELECT count(*) FROM reclamos c2 JOIN pedidos p2 ON p2.id=c2.pedido_id WHERE p2.comprador_celular=p.comprador_celular AND c2.id<>c.id),
		(SELECT count(*) FROM reclamos c3 JOIN pedidos p3 ON p3.id=c3.pedido_id WHERE p3.tienda_id=p.tienda_id AND c3.estado='a_favor_comprador'),
		COALESCE(p.confirmado_por,'')
		FROM reclamos c LEFT JOIN envios e ON e.pedido_id=c.pedido_id JOIN pedidos p ON p.id=c.pedido_id JOIN tiendas t ON t.id=p.tienda_id
		WHERE NOT $1 OR c.estado IN ('abierto','en_revision') ORDER BY c.creado_en DESC LIMIT 100`, abiertos)
	if err != nil {
		return err
	}
	defer rows.Close()
	type reclamo struct {
		ID             string     `json:"id"`
		PedidoID       string     `json:"pedido_id"`
		Codigo         string     `json:"codigo"`
		Tienda         string     `json:"tienda"`
		Comprador      string     `json:"comprador"`
		Total          int        `json:"total_centimos"`
		Motivo         string     `json:"motivo"`
		Descripcion    string     `json:"descripcion"`
		Fotos          []string   `json:"fotos"`
		Respuesta      string     `json:"respuesta_vendedor"`
		Evidencias     []string   `json:"evidencias"`
		Estado         string     `json:"estado"`
		Nota           string     `json:"nota_admin"`
		CreadoEn       time.Time  `json:"creado_en"`
		Respondido     *time.Time `json:"respondido_en"`
		Resuelto       *time.Time `json:"resuelto_en"`
		Devolucion     string     `json:"devolucion"` // estado de la devolución que hace la tienda
		Entrega        string     `json:"entrega"`
		Agencia        string     `json:"agencia"`
		NumeroOrden    string     `json:"numero_orden"`
		Boleta         bool       `json:"boleta"`
		Reputacion     string     `json:"reputacion"`
		ClienteAntes   int        `json:"cliente_reclamos_antes"`
		TiendaPerdidos int        `json:"tienda_reclamos_perdidos"`
		Confirmado     string     `json:"confirmado_por"`
	}
	out := []reclamo{}
	for rows.Next() {
		var x reclamo
		var fotos, evid []string
		if err := rows.Scan(&x.ID, &x.PedidoID, &x.Codigo, &x.Tienda, &x.Comprador, &x.Total, &x.Motivo, &x.Descripcion,
			pq.Array(&fotos), &x.Respuesta, pq.Array(&evid), &x.Estado, &x.Nota, &x.CreadoEn, &x.Respondido, &x.Resuelto, &x.Devolucion,
			&x.Entrega, &x.Agencia, &x.NumeroOrden, &x.Boleta, &x.Reputacion, &x.ClienteAntes, &x.TiendaPerdidos, &x.Confirmado); err != nil {
			return err
		}
		x.Fotos, x.Evidencias = []string{}, []string{}
		for _, k := range fotos {
			x.Fotos = append(x.Fotos, m.urlPrivada(ctx, k))
		}
		for _, k := range evid {
			x.Evidencias = append(x.Evidencias, m.urlPrivada(ctx, k))
		}
		out = append(out, x)
	}
	var k struct {
		DevolucionesMonto int `json:"devoluciones_pendientes_centimos"`
		Devoluciones      int `json:"devoluciones_pendientes"`
		Abiertos          int `json:"abiertos"`
		Planes            int `json:"ingresos_planes_mes_centimos"`
	}
	m.app.DB.QueryRowContext(ctx, `SELECT
		COALESCE((SELECT SUM(monto_centimos) FROM devoluciones WHERE estado='pendiente_tienda'),0),
		(SELECT count(*) FROM devoluciones WHERE estado='pendiente_tienda'),
		(SELECT count(*) FROM reclamos WHERE estado IN ('abierto','en_revision')),
		COALESCE((SELECT SUM(monto_centimos) FROM pagos_plan WHERE estado='confirmado' AND date_trunc('month', creado_en AT TIME ZONE 'America/Lima') = date_trunc('month', now() AT TIME ZONE 'America/Lima')),0)`).
		Scan(&k.DevolucionesMonto, &k.Devoluciones, &k.Abiertos, &k.Planes)
	httpx.OK(w, map[string]any{"reclamos": out, "indicadores": k})
	return nil
}

func (m *Modulo) resolverReclamo(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		AFavor string `json:"a_favor"`
		Nota   string `json:"nota"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Nota = strings.TrimSpace(in.Nota)
	if len([]rune(in.Nota)) < 10 {
		return httpx.Invalido("Explica en una frase por qué se resuelve así (lo verán la tienda y el comprador).")
	}
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		_, err := pedidos.ResolverReclamo(ctx, m.app, tx, chi.URLParam(r, "id"), in.AFavor, in.Nota, adminID(ctx))
		return err
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Reclamo resuelto."})
	return nil
}

// ---------- auditoría ----------

type Evento struct {
	ID        int64     `json:"id"`
	Usuario   string    `json:"usuario"`
	Rol       string    `json:"rol"`
	Accion    string    `json:"accion"`
	Entidad   string    `json:"entidad"`
	EntidadID string    `json:"entidad_id"`
	Datos     string    `json:"datos"`
	Fecha     time.Time `json:"creado_en"`
}

const consultaAuditoria = `SELECT a.id, COALESCE(u.nombre,'Sistema'), COALESCE(u.rol,''), a.accion, a.entidad, COALESCE(a.entidad_id,''),
	COALESCE(a.datos::text,''), a.creado_en FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id`

func leerEventos(rows *sql.Rows) []Evento {
	defer rows.Close()
	out := []Evento{}
	for rows.Next() {
		var e Evento
		if rows.Scan(&e.ID, &e.Usuario, &e.Rol, &e.Accion, &e.Entidad, &e.EntidadID, &e.Datos, &e.Fecha) == nil {
			out = append(out, e)
		}
	}
	return out
}

func (m *Modulo) auditoria(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	soloAdmin := q.Get("quien") == "admin"
	rows, err := m.app.DB.QueryContext(r.Context(), consultaAuditoria+`
		WHERE ($1 = '' OR a.accion = $1) AND (NOT $2 OR u.rol='admin')
		ORDER BY a.creado_en DESC LIMIT 200`, q.Get("accion"), soloAdmin)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"eventos": leerEventos(rows)})
	return nil
}
