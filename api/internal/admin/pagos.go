package admin

import (
	"net/http"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Pagos de los compradores (pasan por Culqi y quedan retenidos hasta la entrega)
// y suscripciones de las tiendas a los planes. Todo sale de los pedidos y pagos reales.

type PagoAdmin struct {
	PedidoID  string     `json:"pedido_id"`
	Codigo    string     `json:"codigo"`
	Cargo     *string    `json:"cargo"`
	Tienda    string     `json:"tienda"`
	Comprador string     `json:"comprador"`
	Metodo    string     `json:"metodo"`
	Estado    string     `json:"estado"` // retenido, liberado, pendiente, devuelto
	Monto     int        `json:"monto_centimos"`
	Comision  int        `json:"comision_centimos"`
	LiberarEn *time.Time `json:"liberar_en"`
	CreadoEn  time.Time  `json:"creado_en"`
}

func (m *Modulo) pagos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, p.culqi_cargo_id, t.nombre, p.comprador_nombre, p.metodo_pago,
		CASE WHEN p.pago_estado='devuelto' THEN 'devuelto' WHEN p.pago_estado='pendiente' THEN 'pendiente'
			WHEN p.liberado THEN 'liberado' ELSE 'retenido' END,
		p.total_centimos, p.comision_pasarela_centimos, p.liberar_en, p.creado_en
		FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id
		WHERE NOT (p.pago_estado='pendiente' AND p.estado IN ('rechazado','cancelado'))
		ORDER BY p.creado_en DESC LIMIT 5000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []PagoAdmin{}
	for rows.Next() {
		var p PagoAdmin
		if err := rows.Scan(&p.PedidoID, &p.Codigo, &p.Cargo, &p.Tienda, &p.Comprador, &p.Metodo, &p.Estado, &p.Monto, &p.Comision, &p.LiberarEn, &p.CreadoEn); err != nil {
			return err
		}
		out = append(out, p)
	}
	var k struct {
		HoyN         int `json:"hoy"`
		HoyMonto     int `json:"hoy_monto_centimos"`
		Retenido     int `json:"retenido_centimos"`
		RetenidoN    int `json:"retenido"`
		LiberadoMes  int `json:"liberado_mes_centimos"`
		DevueltosMes int `json:"devueltos_mes"`
	}
	m.app.DB.QueryRowContext(ctx, `SELECT
		count(*) FILTER (WHERE pago_estado='pagado' AND (creado_en AT TIME ZONE 'America/Lima')::date=(now() AT TIME ZONE 'America/Lima')::date),
		COALESCE(SUM(total_centimos) FILTER (WHERE pago_estado='pagado' AND (creado_en AT TIME ZONE 'America/Lima')::date=(now() AT TIME ZONE 'America/Lima')::date),0),
		COALESCE(SUM(total_centimos) FILTER (WHERE pago_estado='pagado' AND NOT liberado),0),
		count(*) FILTER (WHERE pago_estado='pagado' AND NOT liberado),
		COALESCE(SUM(total_centimos-comision_pasarela_centimos) FILTER (WHERE liberado AND date_trunc('month', COALESCE(liberar_en,creado_en))=date_trunc('month', now())),0),
		count(*) FILTER (WHERE pago_estado='devuelto' AND date_trunc('month', COALESCE(cerrado_en,creado_en))=date_trunc('month', now()))
		FROM pedidos`).Scan(&k.HoyN, &k.HoyMonto, &k.Retenido, &k.RetenidoN, &k.LiberadoMes, &k.DevueltosMes)
	httpx.OK(w, map[string]any{"pagos": out, "resumen": k})
	return nil
}

type SuscripcionAdmin struct {
	TiendaID    string     `json:"tienda_id"`
	Tienda      string     `json:"tienda"`
	Rubro       string     `json:"rubro"`
	Lugar       string     `json:"lugar"`
	LogoURL     string     `json:"logo_url"`
	PlanID      string     `json:"plan_id"`
	Plan        string     `json:"plan"`
	Precio      int        `json:"precio_centimos"`
	MesGratis   bool       `json:"mes_gratis"`
	Inicio      *time.Time `json:"inicio"`
	Fin         *time.Time `json:"fin"`
	UltimoPago  *time.Time `json:"ultimo_pago"`
	UltimoMonto *int       `json:"ultimo_monto_centimos"`
	Estado      string     `json:"estado"` // activa, vencida, suspendida
}

func (m *Modulo) suscripciones(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	// Una tienda sin suscripción activa está en el plan Gratis.
	rows, err := m.app.DB.QueryContext(ctx, `SELECT t.id, t.nombre, t.rubro, COALESCE(NULLIF(t.distrito,'')||', ','')||t.ciudad, COALESCE(t.logo_key,''),
		pl.id, pl.nombre, pl.precio_centimos, COALESCE(s.mes_gratis,false), s.inicio,
		-- Próximo cobro: el fin del periodo o, si se renueva cada mes, el siguiente aniversario del inicio.
		COALESCE(s.fin, s.inicio + make_interval(months => (EXTRACT(year FROM age(now(), s.inicio))*12 + EXTRACT(month FROM age(now(), s.inicio)))::int + 1)),
		(SELECT max(creado_en) FROM pagos_plan pp WHERE pp.tienda_id=t.id),
		(SELECT monto_centimos FROM pagos_plan pp WHERE pp.tienda_id=t.id ORDER BY creado_en DESC LIMIT 1),
		CASE WHEN NOT t.activa THEN 'suspendida' WHEN s.fin IS NOT NULL AND s.fin < now() THEN 'vencida' ELSE 'activa' END
		FROM tiendas t
		LEFT JOIN suscripciones s ON s.tienda_id=t.id AND s.activa
		JOIN planes pl ON pl.id=COALESCE(s.plan_id,'gratis')
		ORDER BY pl.orden DESC, t.nombre LIMIT 5000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []SuscripcionAdmin{}
	for rows.Next() {
		var s SuscripcionAdmin
		var logo string
		if err := rows.Scan(&s.TiendaID, &s.Tienda, &s.Rubro, &s.Lugar, &logo, &s.PlanID, &s.Plan, &s.Precio, &s.MesGratis, &s.Inicio, &s.Fin, &s.UltimoPago, &s.UltimoMonto, &s.Estado); err != nil {
			return err
		}
		if logo != "" {
			s.LogoURL = m.app.Archivos.URLPublica(logo)
		}
		out = append(out, s)
	}
	type plan struct {
		ID     string `json:"id"`
		Nombre string `json:"nombre"`
		Precio int    `json:"precio_centimos"`
	}
	planes := []plan{}
	if pr, err := m.app.DB.QueryContext(ctx, `SELECT id, nombre, precio_centimos FROM planes ORDER BY orden`); err == nil {
		for pr.Next() {
			var p plan
			pr.Scan(&p.ID, &p.Nombre, &p.Precio)
			planes = append(planes, p)
		}
		pr.Close()
	}
	httpx.OK(w, map[string]any{"suscripciones": out, "planes": planes})
	return nil
}
