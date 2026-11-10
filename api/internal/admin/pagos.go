package admin

import (
	"net/http"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	pagospkg "github.com/solanchveliz-dev/vendigo/api/internal/pagos"
)

// Pagos de los pedidos (el comprador le paga directo a la tienda; VendiGo solo registra y da seguimiento)
// y suscripciones de las tiendas a los planes de VendiGo.

type PagoAdmin struct {
	PedidoID   string     `json:"pedido_id"`
	Codigo     string     `json:"codigo"`
	Tienda     string     `json:"tienda"`
	Comprador  string     `json:"comprador"`
	Metodo     string     `json:"metodo"`
	Momento    string     `json:"momento"`
	Estado     string     `json:"estado"`
	Texto      string     `json:"estado_texto"`
	Origen     string     `json:"origen"`
	Monto      int        `json:"monto_centimos"`
	Referencia string     `json:"referencia"`
	Informado  *time.Time `json:"informado_en"`
	Devolucion *string    `json:"devolucion"`
	CreadoEn   time.Time  `json:"creado_en"`
}

// pagos lista los pagos de los pedidos tal como los informan el comprador y la tienda.
// VendiGo no recibe ese dinero: solo da seguimiento.
func (m *Modulo) pagos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, t.nombre, p.comprador_nombre, g.metodo, g.momento, g.estado, g.origen,
		g.monto_centimos, g.referencia, g.informado_en,
		(SELECT d.estado FROM devoluciones d WHERE d.pedido_id=p.id ORDER BY d.creado_en DESC LIMIT 1), p.creado_en
		FROM pagos g JOIN pedidos p ON p.id=g.pedido_id JOIN tiendas t ON t.id=p.tienda_id
		ORDER BY p.creado_en DESC LIMIT 5000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []PagoAdmin{}
	for rows.Next() {
		var p PagoAdmin
		if err := rows.Scan(&p.PedidoID, &p.Codigo, &p.Tienda, &p.Comprador, &p.Metodo, &p.Momento, &p.Estado, &p.Origen, &p.Monto, &p.Referencia, &p.Informado, &p.Devolucion, &p.CreadoEn); err != nil {
			return err
		}
		p.Texto = pagospkg.Textos[p.Estado]
		out = append(out, p)
	}
	var k struct {
		InformadosHoy int `json:"informados_hoy"`
		InformadosMto int `json:"informados_hoy_centimos"`
		PorConfirmar  int `json:"por_confirmar"`
		AlRecibir     int `json:"al_recibir"`
		Devoluciones  int `json:"devoluciones_pendientes"`
		DevolucionMto int `json:"devoluciones_pendientes_centimos"`
	}
	m.app.DB.QueryRowContext(ctx, `SELECT
		count(*) FILTER (WHERE g.estado IN ('informado_tienda','confirmado') AND (g.informado_en AT TIME ZONE 'America/Lima')::date=(now() AT TIME ZONE 'America/Lima')::date),
		COALESCE(SUM(g.monto_centimos) FILTER (WHERE g.estado IN ('informado_tienda','confirmado') AND (g.informado_en AT TIME ZONE 'America/Lima')::date=(now() AT TIME ZONE 'America/Lima')::date),0),
		count(*) FILTER (WHERE g.estado IN ('pendiente','comprobante_enviado','no_recibido') AND p.estado NOT IN ('rechazado','cancelado')),
		count(*) FILTER (WHERE g.estado='paga_al_recibir' AND p.estado NOT IN ('rechazado','cancelado','entregado'))
		FROM pagos g JOIN pedidos p ON p.id=g.pedido_id`).Scan(&k.InformadosHoy, &k.InformadosMto, &k.PorConfirmar, &k.AlRecibir)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*), COALESCE(SUM(monto_centimos),0) FROM devoluciones WHERE estado='pendiente_tienda'`).Scan(&k.Devoluciones, &k.DevolucionMto)
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
