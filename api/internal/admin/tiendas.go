package admin

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Tiendas: todas las tiendas, su revisión y su suspensión.
// Las tiendas nuevas se publican al instante; quedan "En revisión" hasta que el admin las aprueba.

type Tienda struct {
	ID         string     `json:"id"`
	Nombre     string     `json:"nombre"`
	Slug       string     `json:"slug"`
	Rubro      string     `json:"rubro"`
	Lugar      string     `json:"lugar"`
	LogoURL    string     `json:"logo_url"`
	Estado     string     `json:"estado"` // activa, revision, suspendida
	Motivo     string     `json:"suspendida_motivo"`
	Productos  int        `json:"productos"`
	Ventas     int        `json:"ventas"`
	Reputacion string     `json:"reputacion"`
	UsuarioID  string     `json:"usuario_id"`
	Dueno      string     `json:"dueno"`
	CreadoEn   time.Time  `json:"creado_en"`
	Revisada   *time.Time `json:"revisada_en"`
}

const consultaTiendas = `SELECT t.id, t.nombre, t.slug, t.rubro, COALESCE(NULLIF(t.distrito,'')||', ','')||t.ciudad, COALESCE(t.logo_key,''),
	CASE WHEN NOT t.activa THEN 'suspendida' WHEN t.revisada_en IS NULL THEN 'revision' ELSE 'activa' END,
	CASE WHEN t.suspendida_motivo<>'' THEN t.suspendida_motivo WHEN NOT u.activo THEN 'Cuenta suspendida: '||u.suspendido_motivo ELSE '' END,
	(SELECT count(*) FROM productos p WHERE p.tienda_id=t.id AND p.activo AND NOT p.eliminado),
	(SELECT count(*) FROM pedidos p WHERE p.tienda_id=t.id AND p.estado NOT IN ('rechazado','cancelado')),
	t.reputacion, u.id, u.nombre, t.creado_en, t.revisada_en
	FROM tiendas t JOIN usuarios u ON u.id=t.usuario_id`

func (m *Modulo) scanTienda(s interface{ Scan(...any) error }) (Tienda, error) {
	var t Tienda
	var logo string
	err := s.Scan(&t.ID, &t.Nombre, &t.Slug, &t.Rubro, &t.Lugar, &logo, &t.Estado, &t.Motivo, &t.Productos, &t.Ventas, &t.Reputacion, &t.UsuarioID, &t.Dueno, &t.CreadoEn, &t.Revisada)
	if logo != "" {
		t.LogoURL = m.app.Archivos.URLPublica(logo)
	}
	return t, err
}

func (m *Modulo) tiendas(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), consultaTiendas+` ORDER BY t.revisada_en IS NOT NULL, t.creado_en DESC LIMIT 1000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Tienda{}
	for rows.Next() {
		t, err := m.scanTienda(rows)
		if err != nil {
			return err
		}
		out = append(out, t)
	}
	httpx.OK(w, map[string]any{"tiendas": out})
	return nil
}

func (m *Modulo) tienda(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	t, err := m.scanTienda(m.app.DB.QueryRowContext(ctx, consultaTiendas+` WHERE t.id::text=$1`, chi.URLParam(r, "id")))
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	var info struct {
		Descripcion string   `json:"descripcion"`
		Horario     string   `json:"horario"`
		Politicas   string   `json:"politicas"`
		Entrega     []string `json:"entrega"`
		PortadaURL  string   `json:"portada_url"`
		Reclamos    int      `json:"reclamos"`
		Contacto    bool     `json:"contacto_verificado"`
		Identidad   string   `json:"identidad"`
	}
	var portada string
	var recojo, agencia, moto, otra bool
	m.app.DB.QueryRowContext(ctx, `SELECT t.descripcion, t.horario, t.politicas, COALESCE(t.portada_key,''), t.entrega_recojo, t.entrega_agencia, t.entrega_motorizado, t.entrega_otra,
		(SELECT count(*) FROM reclamos c JOIN pedidos p ON p.id=c.pedido_id WHERE p.tienda_id=t.id),
		u.celular_verificado,
		COALESCE((SELECT v.estado FROM verificaciones v WHERE v.tienda_id=t.id AND v.clase='identidad' ORDER BY v.creado_en DESC LIMIT 1),'sin_enviar')
		FROM tiendas t JOIN usuarios u ON u.id=t.usuario_id WHERE t.id=$1`, t.ID).
		Scan(&info.Descripcion, &info.Horario, &info.Politicas, &portada, &recojo, &agencia, &moto, &otra, &info.Reclamos, &info.Contacto, &info.Identidad)
	if portada != "" {
		info.PortadaURL = m.app.Archivos.URLPublica(portada)
	}
	info.Entrega = []string{}
	for _, e := range []struct {
		ok bool
		t  string
	}{{agencia, "Envío por agencia"}, {recojo, "Recojo en tienda"}, {moto, "Motorizado"}, {otra, "Otra"}} {
		if e.ok {
			info.Entrega = append(info.Entrega, e.t)
		}
	}
	type producto struct {
		ID        string `json:"id"`
		Nombre    string `json:"nombre"`
		Precio    int    `json:"precio_centimos"`
		ImagenURL string `json:"imagen_url"`
		Activo    bool   `json:"activo"`
	}
	productos := []producto{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, p.nombre, p.precio_centimos, p.activo,
		COALESCE((SELECT i.key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY i.orden LIMIT 1),'')
		FROM productos p WHERE p.tienda_id=$1 AND NOT p.eliminado ORDER BY p.creado_en DESC LIMIT 12`, t.ID); err == nil {
		for rows.Next() {
			var p producto
			var img string
			rows.Scan(&p.ID, &p.Nombre, &p.Precio, &p.Activo, &img)
			if img != "" {
				p.ImagenURL = m.app.Archivos.URLPublica(img)
			}
			productos = append(productos, p)
		}
		rows.Close()
	}
	httpx.OK(w, map[string]any{"tienda": t, "info": info, "productos": productos})
	return nil
}

func (m *Modulo) aprobarTienda(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	res, err := m.app.DB.ExecContext(ctx, `UPDATE tiendas SET revisada_en=now(), revisada_por=$2 WHERE id::text=$1 AND revisada_en IS NULL`, id, adminID(ctx))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.Conflicto("ya_revisada", "Esta tienda ya fue aprobada.")
	}
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "aprobar_tienda", "tienda", id, nil)
	httpx.OK(w, map[string]string{"mensaje": "Tienda aprobada."})
	return nil
}

func (m *Modulo) suspenderTienda(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	motivo, err := motivoObligatorio(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE tiendas SET activa=false, suspendida_motivo=$2 WHERE id::text=$1 AND activa`, id, motivo)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return httpx.Conflicto("no_aplica", "La tienda ya está suspendida.")
		}
		billetera.Notificar(ctx, tx, id, "Suspendimos tu tienda", "Tus clientes no la ven por ahora. Motivo: "+motivo+" Escríbenos a "+m.correoSoporte(ctx)+".", "/vendedor/tienda")
		billetera.SMSTienda(ctx, tx, id, "Suspendimos tu tienda. Revisa el motivo:", "/vendedor/tienda")
		m.app.Auditar(ctx, tx, adminID(ctx), "suspender_tienda", "tienda", id, map[string]string{"motivo": motivo})
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Tienda suspendida. Ya no se ve ni recibe pedidos."})
	return nil
}

func (m *Modulo) reactivarTienda(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	var activoDueno bool
	m.app.DB.QueryRowContext(ctx, `SELECT u.activo FROM tiendas t JOIN usuarios u ON u.id=t.usuario_id WHERE t.id::text=$1`, id).Scan(&activoDueno)
	if !activoDueno {
		return httpx.Conflicto("cuenta_suspendida", "La cuenta de la dueña está suspendida. Reactívala desde Usuarios o Vendedores.")
	}
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE tiendas SET activa=true, suspendida_motivo='' WHERE id::text=$1 AND NOT activa`, id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return httpx.Conflicto("no_aplica", "La tienda ya está activa.")
		}
		billetera.Notificar(ctx, tx, id, "Tu tienda está activa otra vez", "Tus clientes ya pueden verla y comprarte.", "/vendedor/tienda")
		m.app.Auditar(ctx, tx, adminID(ctx), "reactivar_tienda", "tienda", id, nil)
		return nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Tienda reactivada."})
	return nil
}
