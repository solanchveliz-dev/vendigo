package admin

import (
	"net/http"
	"strconv"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

var lima = func() *time.Location {
	l, err := time.LoadLocation("America/Lima")
	if err != nil {
		return time.FixedZone("PET", -5*3600)
	}
	return l
}()

// panel: los números del "Panel de administración", todos calculados de la base de datos.
func (m *Modulo) panel(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	type indicadores struct {
		Usuarios         int     `json:"usuarios"`
		UsuariosSemana   int     `json:"usuarios_semana"`
		Compradores      int     `json:"compradores"`
		Vendedores       int     `json:"vendedores"`
		VendedoresSemana int     `json:"vendedores_semana"`
		Tiendas          int     `json:"tiendas_activas"`
		PorRevisar       int     `json:"identidades_por_revisar"`
		TiendasRevision  int     `json:"tiendas_en_revision"`
		PedidosMes       int     `json:"pedidos_mes"`
		PedidosMesAnt    int     `json:"pedidos_mes_anterior"`
		Pagos            int     `json:"pagos"`
		PagosPct         float64 `json:"pagos_confirmados_pct"`
		Ventas           int     `json:"ventas_centimos"`
		IngresosPlanes   int     `json:"ingresos_planes_mes_centimos"`
		Pagando          int     `json:"tiendas_pagando"`
		Gratis           int     `json:"tiendas_gratis"`
		Reclamos         int     `json:"reclamos_abiertos"`
	}
	var d indicadores
	var totalPedidos int
	err := m.app.DB.QueryRowContext(ctx, `SELECT
		(SELECT count(*) FROM usuarios WHERE rol<>'admin'),
		(SELECT count(*) FROM usuarios WHERE rol<>'admin' AND creado_en > now()-interval '7 days'),
		(SELECT count(*) FROM usuarios WHERE rol='comprador'),
		(SELECT count(*) FROM usuarios WHERE rol='vendedor'),
		(SELECT count(*) FROM usuarios WHERE rol='vendedor' AND creado_en > now()-interval '7 days'),
		(SELECT count(*) FROM tiendas WHERE activa),
		(SELECT count(*) FROM verificaciones WHERE estado='pendiente'),
		(SELECT count(*) FROM tiendas WHERE activa AND revisada_en IS NULL),
		(SELECT count(*) FROM pedidos WHERE date_trunc('month', creado_en AT TIME ZONE 'America/Lima') = date_trunc('month', now() AT TIME ZONE 'America/Lima')),
		(SELECT count(*) FROM pedidos WHERE date_trunc('month', creado_en AT TIME ZONE 'America/Lima') = date_trunc('month', now() AT TIME ZONE 'America/Lima') - interval '1 month'),
		(SELECT count(*) FROM pagos WHERE estado IN ('informado_tienda','confirmado')),
		(SELECT count(*) FROM pedidos),
		(SELECT COALESCE(SUM(total_centimos),0) FROM pedidos WHERE estado='entregado'),
		(SELECT COALESCE(SUM(monto_centimos),0) FROM pagos_plan WHERE estado='confirmado' AND date_trunc('month', creado_en AT TIME ZONE 'America/Lima') = date_trunc('month', now() AT TIME ZONE 'America/Lima')),
		(SELECT count(*) FROM suscripciones WHERE activa AND plan_id<>'gratis'),
		(SELECT count(*) FROM suscripciones WHERE activa AND plan_id='gratis'),
		(SELECT count(*) FROM reclamos WHERE estado IN ('abierto','en_revision'))`).
		Scan(&d.Usuarios, &d.UsuariosSemana, &d.Compradores, &d.Vendedores, &d.VendedoresSemana, &d.Tiendas, &d.PorRevisar, &d.TiendasRevision,
			&d.PedidosMes, &d.PedidosMesAnt, &d.Pagos, &totalPedidos, &d.Ventas, &d.IngresosPlanes, &d.Pagando, &d.Gratis, &d.Reclamos)
	if err != nil {
		return err
	}
	if totalPedidos > 0 {
		d.PagosPct = float64(d.Pagos) * 100 / float64(totalPedidos)
	}

	// Pedidos por semana (últimas 5, semanas de lunes a domingo en hora de Lima).
	type semana struct {
		Etiqueta string `json:"etiqueta"`
		Pedidos  int    `json:"pedidos"`
	}
	semanas := []semana{}
	hoy := time.Now().In(lima)
	lunes := time.Date(hoy.Year(), hoy.Month(), hoy.Day(), 0, 0, 0, 0, lima).AddDate(0, 0, -((int(hoy.Weekday()) + 6) % 7))
	meses := []string{"Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"}
	for i := 4; i >= 0; i-- {
		ini := lunes.AddDate(0, 0, -7*i)
		var n int
		m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM pedidos WHERE creado_en >= $1 AND creado_en < $2`, ini, ini.AddDate(0, 0, 7)).Scan(&n)
		semanas = append(semanas, semana{Etiqueta: meses[ini.Month()-1] + " S" + strconv.Itoa((ini.Day()-1)/7+1), Pedidos: n})
	}

	type parte struct {
		Clave    string `json:"clave"`
		Nombre   string `json:"nombre"`
		Cantidad int    `json:"cantidad"`
	}
	planes := []parte{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.nombre, count(s.id) FROM planes p
		LEFT JOIN suscripciones s ON s.plan_id=p.id AND s.activa GROUP BY p.id, p.nombre, p.orden ORDER BY p.orden`); err == nil {
		for rows.Next() {
			var x parte
			rows.Scan(&x.Clave, &x.Nombre, &x.Cantidad)
			planes = append(planes, x)
		}
		rows.Close()
	}
	entregas := []parte{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT e, count(p.id) FROM unnest(ARRAY['agencia','motorizado','recojo']) e
		LEFT JOIN pedidos p ON p.entrega=e GROUP BY e ORDER BY count(p.id) DESC`); err == nil {
		nombres := map[string]string{"agencia": "Agencia", "motorizado": "Motorizado", "recojo": "Recojo"}
		for rows.Next() {
			var x parte
			rows.Scan(&x.Clave, &x.Cantidad)
			x.Nombre = nombres[x.Clave]
			entregas = append(entregas, x)
		}
		rows.Close()
	}

	type reclamo struct {
		PedidoID string `json:"pedido_id"`
		Codigo   string `json:"codigo"`
		Tienda   string `json:"tienda"`
		Motivo   string `json:"motivo"`
		Estado   string `json:"estado"`
	}
	reclamos := []reclamo{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, t.nombre, c.motivo, c.estado FROM reclamos c
		JOIN pedidos p ON p.id=c.pedido_id JOIN tiendas t ON t.id=p.tienda_id
		WHERE c.estado IN ('abierto','en_revision') ORDER BY c.creado_en LIMIT 3`); err == nil {
		for rows.Next() {
			var x reclamo
			rows.Scan(&x.PedidoID, &x.Codigo, &x.Tienda, &x.Motivo, &x.Estado)
			reclamos = append(reclamos, x)
		}
		rows.Close()
	}
	type porRevisar struct {
		TiendaID string `json:"tienda_id"`
		Tienda   string `json:"tienda"`
		Lugar    string `json:"lugar"`
		LogoURL  string `json:"logo_url"`
	}
	revisar := []porRevisar{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT t.id, t.nombre, t.ciudad, COALESCE(t.logo_key,'')
		FROM tiendas t WHERE t.activa AND t.revisada_en IS NULL ORDER BY t.creado_en LIMIT 3`); err == nil {
		for rows.Next() {
			var x porRevisar
			var logo string
			rows.Scan(&x.TiendaID, &x.Tienda, &x.Lugar, &logo)
			if logo != "" {
				x.LogoURL = m.app.Archivos.URLPublica(logo)
			}
			revisar = append(revisar, x)
		}
		rows.Close()
	}

	httpx.OK(w, map[string]any{"indicadores": d, "semanas": semanas, "planes": planes, "entregas": entregas,
		"reclamos": reclamos, "por_revisar": revisar, "fecha": hoy.Format("02/01/2006")})
	return nil
}

// ---------- seguridad ----------

func (m *Modulo) seguridad(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	type intento struct {
		Tipo   string    `json:"tipo"` // "permiso" o "ingreso"
		Rol    string    `json:"rol"`
		Nombre string    `json:"nombre"`
		Ruta   string    `json:"ruta"`
		Motivo string    `json:"motivo"`
		IP     string    `json:"ip"`
		Fecha  time.Time `json:"creado_en"`
	}
	intentos := []intento{}
	rows, err := m.app.DB.QueryContext(ctx, `
		SELECT 'permiso', d.rol, COALESCE(u.nombre,''), d.ruta, '', d.ip, d.creado_en FROM accesos_denegados d LEFT JOIN usuarios u ON u.id=d.usuario_id
		WHERE d.creado_en > now()-interval '24 hours'
		UNION ALL
		SELECT 'ingreso', u.rol, u.nombre, '', a.motivo, a.ip, a.creado_en FROM accesos a JOIN usuarios u ON u.id=a.usuario_id
		WHERE NOT a.exito AND a.creado_en > now()-interval '24 hours'
		ORDER BY 7 DESC LIMIT 20`)
	if err != nil {
		return err
	}
	for rows.Next() {
		var x intento
		rows.Scan(&x.Tipo, &x.Rol, &x.Nombre, &x.Ruta, &x.Motivo, &x.IP, &x.Fecha)
		intentos = append(intentos, x)
	}
	rows.Close()
	min := 30
	m.app.DB.QueryRowContext(ctx, `SELECT valor::int FROM ajustes_plataforma WHERE clave='inactividad_admin_min'`).Scan(&min)
	var sinMFA int
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM usuarios WHERE rol='admin' AND NOT totp_activo`).Scan(&sinMFA)
	httpx.OK(w, map[string]any{"intentos": intentos, "inactividad_min": min, "admins_sin_mfa": sinMFA})
	return nil
}

func (m *Modulo) guardarAjustes(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		InactividadMin int `json:"inactividad_min"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if in.InactividadMin != 15 && in.InactividadMin != 30 && in.InactividadMin != 60 {
		return httpx.Invalido("Elige 15, 30 o 60 minutos.")
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO ajustes_plataforma (clave, valor) VALUES ('inactividad_admin_min', $1)
		ON CONFLICT (clave) DO UPDATE SET valor=$1, actualizado_en=now()`, strconv.Itoa(in.InactividadMin)); err != nil {
		return err
	}
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "cambiar_inactividad", "plataforma", "inactividad_admin_min", map[string]int{"minutos": in.InactividadMin})
	httpx.OK(w, map[string]int{"inactividad_min": in.InactividadMin})
	return nil
}

// ---------- notificaciones del administrador (campana) ----------

func (m *Modulo) notificaciones(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := adminID(ctx)
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id, titulo, cuerpo, COALESCE(enlace,''), leida, creado_en FROM notificaciones
		WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 20`, id)
	if err != nil {
		return err
	}
	defer rows.Close()
	type aviso struct {
		ID     string    `json:"id"`
		Titulo string    `json:"titulo"`
		Cuerpo string    `json:"cuerpo"`
		Enlace string    `json:"enlace"`
		Leida  bool      `json:"leida"`
		Fecha  time.Time `json:"creado_en"`
	}
	out := []aviso{}
	for rows.Next() {
		var a aviso
		rows.Scan(&a.ID, &a.Titulo, &a.Cuerpo, &a.Enlace, &a.Leida, &a.Fecha)
		out = append(out, a)
	}
	if r.URL.Query().Get("marcar") == "1" {
		m.app.DB.ExecContext(ctx, `UPDATE notificaciones SET leida=true WHERE usuario_id=$1 AND NOT leida`, id)
	}
	httpx.OK(w, map[string]any{"notificaciones": out})
	return nil
}
