// Package admin es el panel del administrador de VendiGo: supervisa a las vendedoras,
// revisa identidades, registra las transferencias de los retiros y resuelve reclamos.
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

type Modulo struct{ app *core.App }

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
	r.Method("GET", "/retiros", httpx.Handler(m.retiros))
	r.Method("POST", "/retiros/{id}/pagado", httpx.Handler(m.retiroPagado))
	r.Method("POST", "/retiros/{id}/rechazar", httpx.Handler(m.retiroRechazar))
	r.Method("GET", "/reclamos", httpx.Handler(m.reclamos))
	r.Method("POST", "/reclamos/{id}/resolver", httpx.Handler(m.resolverReclamo))
	r.Method("GET", "/auditoria", httpx.Handler(m.auditoria))
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
		Retiros        int `json:"retiros_pendientes"`
		RetirosMonto   int `json:"retiros_pendientes_centimos"`
		Reclamos       int `json:"reclamos_abiertos"`
		Bloqueos       int `json:"cuentas_bloqueadas"`
	}
	err := m.app.DB.QueryRowContext(r.Context(), `SELECT
		(SELECT count(*) FROM usuarios WHERE rol='vendedor'),
		(SELECT count(*) FROM usuarios WHERE rol='vendedor' AND NOT activo),
		(SELECT count(*) FROM usuarios WHERE rol='vendedor' AND creado_en > now() - interval '7 days'),
		(SELECT count(*) FROM verificaciones WHERE estado='pendiente'),
		(SELECT count(*) FROM retiros WHERE estado='en_proceso'),
		(SELECT COALESCE(SUM(monto_centimos),0) FROM retiros WHERE estado='en_proceso'),
		(SELECT count(*) FROM reclamos WHERE estado IN ('abierto','en_revision')),
		(SELECT count(*) FROM usuarios WHERE bloqueado_hasta > now())`).
		Scan(&d.Vendedoras, &d.Suspendidas, &d.NuevasSemana, &d.Verificaciones, &d.Retiros, &d.RetirosMonto, &d.Reclamos, &d.Bloqueos)
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
}

const consultaVendedoras = `SELECT u.id, u.nombre, u.celular, COALESCE(u.email,''), u.activo, u.suspendido_motivo,
	COALESCE(u.bloqueado_hasta > now(), false), u.creado_en,
	COALESCE(t.id::text,''), COALESCE(t.nombre,''), COALESCE(t.slug,''),
	COALESCE((SELECT p.nombre FROM suscripciones s JOIN planes p ON p.id=s.plan_id WHERE s.tienda_id=t.id AND s.activa LIMIT 1),''),
	COALESCE((SELECT v.estado FROM verificaciones v WHERE v.tienda_id=t.id ORDER BY v.creado_en DESC LIMIT 1),'sin_enviar'),
	(SELECT count(*) FROM pedidos p WHERE p.tienda_id=t.id AND p.estado NOT IN ('rechazado','cancelado')),
	COALESCE((SELECT SUM(total_centimos) FROM pedidos p WHERE p.tienda_id=t.id AND p.pago_estado='pagado' AND p.estado NOT IN ('rechazado','cancelado')),0),
	(SELECT max(a.creado_en) FROM accesos a WHERE a.usuario_id=u.id AND a.exito), COALESCE(t.reputacion,'')
	FROM usuarios u LEFT JOIN tiendas t ON t.usuario_id=u.id
	WHERE u.rol='vendedor'`

func scanVendedora(s interface{ Scan(...any) error }) (Vendedora, error) {
	var v Vendedora
	err := s.Scan(&v.ID, &v.Nombre, &v.Celular, &v.Email, &v.Activo, &v.Motivo, &v.Bloqueada, &v.CreadoEn,
		&v.TiendaID, &v.Tienda, &v.Slug, &v.Plan, &v.Verificacion, &v.Pedidos, &v.Ventas, &v.UltimoAcceso, &v.Reputacion)
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

	var saldos billetera.Saldos
	type pagoPlan struct {
		Concepto string    `json:"concepto"`
		Monto    int       `json:"monto_centimos"`
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
	}
	extra.Entrega = []string{}
	if v.TiendaID != "" {
		saldos, _ = billetera.LeerSaldos(ctx, m.app.DB, v.TiendaID)
		var recojo, agencia, moto, otra bool
		m.app.DB.QueryRowContext(ctx, `SELECT COALESCE(NULLIF(distrito,'')||', '||ciudad, ciudad), entrega_recojo, entrega_agencia, entrega_motorizado, entrega_otra, reputacion,
			(SELECT count(*) FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id WHERE p.tienda_id=t.id),
			(SELECT count(*) FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id WHERE p.tienda_id=t.id AND c.estado='a_favor_comprador'),
			(SELECT inicio FROM suscripciones s WHERE s.tienda_id=t.id AND s.activa LIMIT 1),
			COALESCE((SELECT v.id::text FROM verificaciones v WHERE v.tienda_id=t.id ORDER BY v.creado_en DESC LIMIT 1),'')
			FROM tiendas t WHERE t.id=$1`, v.TiendaID).
			Scan(&extra.Ciudad, &recojo, &agencia, &moto, &otra, &extra.Reputacion, &extra.Reclamos, &extra.Perdidos, &extra.PlanDesde, &extra.VerifID)
		for _, e := range []struct {
			ok bool
			t  string
		}{{recojo, "Recojo"}, {agencia, "Agencia"}, {moto, "Motorizado"}, {otra, "Otra"}} {
			if e.ok {
				extra.Entrega = append(extra.Entrega, e.t)
			}
		}
		if rows, err := m.app.DB.QueryContext(ctx, `SELECT concepto, monto_centimos, creado_en FROM pagos_plan WHERE tienda_id=$1 ORDER BY creado_en DESC LIMIT 6`, v.TiendaID); err == nil {
			for rows.Next() {
				var x pagoPlan
				rows.Scan(&x.Concepto, &x.Monto, &x.Fecha)
				pagos = append(pagos, x)
			}
			rows.Close()
		}
	}
	httpx.OK(w, map[string]any{"vendedora": v, "accesos": accesos, "historial": historial, "saldos": saldos, "tienda": extra, "pagos_plan": pagos})
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
		res, err := tx.ExecContext(ctx, `UPDATE usuarios SET activo=false, suspendido_motivo=$2 WHERE id::text=$1 AND rol='vendedor' AND activo`, id, motivo)
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
	res, err := m.app.DB.ExecContext(ctx, `UPDATE usuarios SET activo=true, suspendido_motivo='', intentos_fallidos=0, bloqueado_hasta=NULL
		WHERE id::text=$1 AND rol='vendedor' AND NOT activo`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.Conflicto("no_aplica", "La cuenta no existe o ya está activa.")
	}
	m.app.DB.ExecContext(ctx, `UPDATE tiendas SET activa=true WHERE usuario_id::text=$1`, id)
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

const consultaVerif = `SELECT v.id, v.tienda_id, t.nombre, u.id, u.nombre, v.tipo_documento, v.ultimos4, v.nombre_completo, v.estado,
	v.motivo_rechazo, v.creado_en, v.revisado_en FROM verificaciones v JOIN tiendas t ON t.id=v.tienda_id JOIN usuarios u ON u.id=t.usuario_id`

func scanVerif(s interface{ Scan(...any) error }) (Verificacion, error) {
	var v Verificacion
	err := s.Scan(&v.ID, &v.TiendaID, &v.Tienda, &v.UsuarioID, &v.Titular, &v.Tipo, &v.Ultimos4, &v.Nombre, &v.Estado, &v.Motivo, &v.CreadoEn, &v.Revisado)
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
	m.app.DB.QueryRowContext(ctx, `SELECT numero_cifrado, frente_key, reverso_key, selfie_key FROM verificaciones WHERE id=$1`, v.ID).Scan(&cifrado, &frente, &reverso, &selfie)
	if m.app.Cifrador != nil {
		v.Numero, _ = m.app.Cifrador.Descifrar(cifrado)
	}
	v.Frente = m.urlPrivada(ctx, frente)
	v.Selfie = m.urlPrivada(ctx, selfie)
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
		var tid string
		err := tx.QueryRowContext(ctx, `UPDATE verificaciones SET estado='aprobada', motivo_rechazo='', revisado_en=now(), revisado_por=$2
			WHERE id::text=$1 AND estado='pendiente' RETURNING tienda_id`, id, adminID(ctx)).Scan(&tid)
		if core.SinFilas(err) {
			return httpx.Conflicto("ya_revisada", "Esta verificación ya se revisó o no existe.")
		}
		if err != nil {
			return err
		}
		billetera.Notificar(ctx, tx, tid, "Verificamos tu identidad", "Ya puedes retirar tu dinero a tu cuenta bancaria.", "/vendedor/cobros")
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
		m.app.Auditar(ctx, tx, adminID(ctx), "rechazar_identidad", "verificacion", id, map[string]string{"motivo": motivo})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Verificación rechazada. Le avisamos a la vendedora."})
	return nil
}

// ---------- retiros ----------

func (m *Modulo) retiros(w http.ResponseWriter, r *http.Request) error {
	estado := r.URL.Query().Get("estado")
	if estado == "" {
		estado = "en_proceso"
	}
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT r.id, r.numero, r.tienda_id, t.nombre, u.id, u.nombre, r.monto_centimos, r.banco, r.ultimos4,
		COALESCE(c.titular,''), COALESCE(c.tipo,''), r.estado, r.operacion, r.motivo_rechazo, r.creado_en, r.pagado_en,
		(SELECT count(*) FROM pedidos p WHERE p.retiro_id=r.id)
		FROM retiros r JOIN tiendas t ON t.id=r.tienda_id JOIN usuarios u ON u.id=t.usuario_id
		LEFT JOIN cuentas_bancarias c ON c.tienda_id=r.tienda_id
		WHERE r.estado=$1 OR $1='todos' ORDER BY r.creado_en DESC LIMIT 200`, estado)
	if err != nil {
		return err
	}
	defer rows.Close()
	type retiro struct {
		ID        string     `json:"id"`
		Numero    int64      `json:"numero"`
		TiendaID  string     `json:"tienda_id"`
		Tienda    string     `json:"tienda"`
		UsuarioID string     `json:"usuario_id"`
		Vendedora string     `json:"vendedora"`
		Monto     int        `json:"monto_centimos"`
		Banco     string     `json:"banco"`
		Ultimos4  string     `json:"ultimos4"`
		Titular   string     `json:"titular"`
		TipoCta   string     `json:"tipo_cuenta"`
		Estado    string     `json:"estado"`
		Operacion string     `json:"operacion"`
		Motivo    string     `json:"motivo_rechazo"`
		CreadoEn  time.Time  `json:"creado_en"`
		PagadoEn  *time.Time `json:"pagado_en"`
		Pedidos   int        `json:"pedidos"`
	}
	out := []retiro{}
	for rows.Next() {
		var x retiro
		if err := rows.Scan(&x.ID, &x.Numero, &x.TiendaID, &x.Tienda, &x.UsuarioID, &x.Vendedora, &x.Monto, &x.Banco, &x.Ultimos4, &x.Titular, &x.TipoCta,
			&x.Estado, &x.Operacion, &x.Motivo, &x.CreadoEn, &x.PagadoEn, &x.Pedidos); err != nil {
			return err
		}
		out = append(out, x)
	}
	// Indicadores de arriba: en proceso, pagado esta semana y dinero retenido
	// (saldo disponible de tiendas que aún no tienen su identidad verificada).
	var k struct {
		EnProceso      int `json:"en_proceso_centimos"`
		EnProcesoN     int `json:"en_proceso"`
		PagadoSemana   int `json:"pagado_semana_centimos"`
		PagadoSemanaN  int `json:"pagado_semana"`
		Retenido       int `json:"retenido_centimos"`
		RetenidoTienda int `json:"retenido_tiendas"`
	}
	m.app.DB.QueryRowContext(r.Context(), `SELECT
		COALESCE((SELECT SUM(monto_centimos) FROM retiros WHERE estado='en_proceso'),0), (SELECT count(*) FROM retiros WHERE estado='en_proceso'),
		COALESCE((SELECT SUM(monto_centimos) FROM retiros WHERE estado='pagado' AND pagado_en > date_trunc('week', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'),0),
		(SELECT count(*) FROM retiros WHERE estado='pagado' AND pagado_en > date_trunc('week', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'),
		COALESCE((SELECT SUM(x.s) FROM (SELECT m.tienda_id, SUM(m.monto_centimos) s FROM movimientos m WHERE m.bolsa='disponible'
			AND NOT EXISTS (SELECT 1 FROM verificaciones v WHERE v.tienda_id=m.tienda_id AND v.estado='aprobada') GROUP BY m.tienda_id HAVING SUM(m.monto_centimos)>0) x),0),
		(SELECT count(*) FROM (SELECT m.tienda_id FROM movimientos m WHERE m.bolsa='disponible'
			AND NOT EXISTS (SELECT 1 FROM verificaciones v WHERE v.tienda_id=m.tienda_id AND v.estado='aprobada') GROUP BY m.tienda_id HAVING SUM(m.monto_centimos)>0) y)`).
		Scan(&k.EnProceso, &k.EnProcesoN, &k.PagadoSemana, &k.PagadoSemanaN, &k.Retenido, &k.RetenidoTienda)
	httpx.OK(w, map[string]any{"retiros": out, "indicadores": k})
	return nil
}

func (m *Modulo) retiroPagado(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Operacion string `json:"operacion"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Operacion = strings.TrimSpace(in.Operacion)
	if len(in.Operacion) < 4 || len(in.Operacion) > 30 {
		return httpx.Invalido("Escribe el número de operación de la transferencia.")
	}
	id := chi.URLParam(r, "id")
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if _, err := billetera.MarcarRetiroPagado(ctx, tx, id, in.Operacion); err != nil {
			return err
		}
		m.app.Auditar(ctx, tx, adminID(ctx), "retiro_pagado", "retiro", id, map[string]string{"operacion": in.Operacion})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Retiro marcado como transferido. Le avisamos a la vendedora."})
	return nil
}

func (m *Modulo) retiroRechazar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	motivo, err := motivoObligatorio(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if _, err := billetera.RechazarRetiro(ctx, tx, id, motivo); err != nil {
			return err
		}
		m.app.Auditar(ctx, tx, adminID(ctx), "retiro_rechazado", "retiro", id, map[string]string{"motivo": motivo})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Retiro rechazado. El dinero volvió a su saldo disponible."})
	return nil
}

// ---------- reclamos ----------

func (m *Modulo) reclamos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	abiertos := r.URL.Query().Get("estado") != "todos"
	rows, err := m.app.DB.QueryContext(ctx, `SELECT c.id, p.id, p.codigo, t.nombre, p.comprador_nombre, p.total_centimos, c.motivo, c.descripcion,
		c.fotos, COALESCE(c.respuesta_vendedor,''), c.evidencias, c.estado, c.nota_admin, c.creado_en, c.respondido_en, c.resuelto_en, p.liberado,
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
		Liberado       bool       `json:"liberado"`
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
			pq.Array(&fotos), &x.Respuesta, pq.Array(&evid), &x.Estado, &x.Nota, &x.CreadoEn, &x.Respondido, &x.Resuelto, &x.Liberado,
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
		Retenido  int `json:"retenido_centimos"`
		RetenidoN int `json:"retenido_pedidos"`
		Abiertos  int `json:"abiertos"`
		Planes    int `json:"ingresos_planes_mes_centimos"`
	}
	m.app.DB.QueryRowContext(ctx, `SELECT
		COALESCE((SELECT SUM(monto_centimos) FROM movimientos WHERE bolsa='a_liberar'),0),
		(SELECT count(*) FROM pedidos WHERE pago_estado='pagado' AND NOT liberado AND estado NOT IN ('rechazado','cancelado')),
		(SELECT count(*) FROM reclamos WHERE estado IN ('abierto','en_revision')),
		COALESCE((SELECT SUM(monto_centimos) FROM pagos_plan WHERE date_trunc('month', creado_en AT TIME ZONE 'America/Lima') = date_trunc('month', now() AT TIME ZONE 'America/Lima')),0)`).
		Scan(&k.Retenido, &k.RetenidoN, &k.Abiertos, &k.Planes)
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
