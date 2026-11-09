package admin

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Usuarios: todas las cuentas de la plataforma (compradores, vendedores y administradores).

type Usuario struct {
	ID           string     `json:"id"`
	Nombre       string     `json:"nombre"`
	Email        string     `json:"email"`
	Celular      string     `json:"celular"`
	Rol          string     `json:"rol"`
	Estado       string     `json:"estado"` // activo, bloqueado, pendiente, suspendido
	Motivo       string     `json:"suspendido_motivo"`
	Ciudad       string     `json:"ciudad"`
	CreadoEn     time.Time  `json:"creado_en"`
	UltimoAcceso *time.Time `json:"ultimo_acceso"`
	Pedidos      int        `json:"pedidos"`
	TiendaID     string     `json:"tienda_id"`
	Tienda       string     `json:"tienda"`
}

// La ciudad sale de su tienda (vendedores) o de su último pedido (compradores).
const consultaUsuarios = `SELECT u.id, u.nombre, COALESCE(u.email,''), u.celular, u.rol,
	CASE WHEN NOT u.activo THEN 'suspendido'
	     WHEN u.bloqueado_hasta > now() THEN 'bloqueado'
	     WHEN NOT u.celular_verificado THEN 'pendiente'
	     WHEN u.rol='vendedor' AND EXISTS (SELECT 1 FROM verificaciones v JOIN tiendas t2 ON t2.id=v.tienda_id WHERE t2.usuario_id=u.id AND v.estado='pendiente') THEN 'pendiente'
	     ELSE 'activo' END,
	u.suspendido_motivo,
	COALESCE(t.ciudad, (SELECT NULLIF(p.ciudad,'') FROM pedidos p WHERE p.comprador_celular=u.celular ORDER BY p.creado_en DESC LIMIT 1), ''),
	u.creado_en, (SELECT max(a.creado_en) FROM accesos a WHERE a.usuario_id=u.id AND a.exito),
	(SELECT count(*) FROM pedidos p WHERE p.comprador_celular=u.celular OR p.comprador_id=u.id),
	COALESCE(t.id::text,''), COALESCE(t.nombre,'')
	FROM usuarios u LEFT JOIN tiendas t ON t.usuario_id=u.id`

func scanUsuario(s interface{ Scan(...any) error }) (Usuario, error) {
	var u Usuario
	err := s.Scan(&u.ID, &u.Nombre, &u.Email, &u.Celular, &u.Rol, &u.Estado, &u.Motivo, &u.Ciudad, &u.CreadoEn, &u.UltimoAcceso, &u.Pedidos, &u.TiendaID, &u.Tienda)
	return u, err
}

func (m *Modulo) usuarios(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), consultaUsuarios+` ORDER BY u.creado_en DESC LIMIT 1000`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Usuario{}
	for rows.Next() {
		u, err := scanUsuario(rows)
		if err != nil {
			return err
		}
		out = append(out, u)
	}
	httpx.OK(w, map[string]any{"usuarios": out})
	return nil
}

func (m *Modulo) usuario(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	u, err := scanUsuario(m.app.DB.QueryRowContext(ctx, consultaUsuarios+` WHERE u.id::text=$1`, chi.URLParam(r, "id")))
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	// Actividad reciente: ingresos, pedidos que hizo y acciones registradas, mezclados por fecha.
	type actividad struct {
		Tipo  string    `json:"tipo"` // acceso, pedido, accion
		Texto string    `json:"texto"`
		Fecha time.Time `json:"creado_en"`
	}
	act := []actividad{}
	rows, err := m.app.DB.QueryContext(ctx, `
		(SELECT 'acceso', CASE WHEN exito THEN 'Inició sesión' ELSE 'Intento fallido: '||motivo END, agente, creado_en FROM accesos WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 6)
		UNION ALL
		(SELECT 'pedido', 'Realizó el pedido '||codigo, '', creado_en FROM pedidos WHERE comprador_celular=$2 OR comprador_id=$1 ORDER BY creado_en DESC LIMIT 6)
		UNION ALL
		(SELECT 'accion', accion, '', creado_en FROM auditoria WHERE usuario_id=$1 OR entidad_id=$3 ORDER BY creado_en DESC LIMIT 6)
		ORDER BY 4 DESC LIMIT 10`, u.ID, u.Celular, u.ID)
	if err == nil {
		for rows.Next() {
			var a actividad
			var agente string
			rows.Scan(&a.Tipo, &a.Texto, &agente, &a.Fecha)
			if a.Tipo == "acceso" && agente != "" {
				a.Texto += " desde " + equipoAgente(agente)
			}
			act = append(act, a)
		}
		rows.Close()
	}
	httpx.OK(w, map[string]any{"usuario": u, "actividad": act})
	return nil
}

func equipoAgente(ua string) string {
	nav := "un navegador"
	for _, x := range []struct{ k, v string }{{"Edg/", "Edge"}, {"OPR/", "Opera"}, {"Chrome/", "Chrome"}, {"Firefox/", "Firefox"}, {"Safari/", "Safari"}} {
		if strings.Contains(ua, x.k) {
			nav = x.v
			break
		}
	}
	for _, x := range []struct{ k, v string }{{"iPhone", "iPhone"}, {"Android", "Android"}, {"Mac OS", "Mac"}, {"Windows", "Windows"}, {"Linux", "Linux"}} {
		if strings.Contains(ua, x.k) {
			return nav + " · " + x.v
		}
	}
	return nav
}

// cambioPassword le envía un código por SMS para que elija una contraseña nueva en "Recuperar contraseña".
func (m *Modulo) cambioPassword(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	var celular, rol string
	var verificado bool
	err := m.app.DB.QueryRowContext(ctx, `SELECT celular, rol, celular_verificado FROM usuarios WHERE id::text=$1`, id).Scan(&celular, &rol, &verificado)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	if rol == "admin" {
		return httpx.Conflicto("no_aplica", "Los administradores cambian su contraseña desde su propia cuenta.")
	}
	if !verificado {
		return httpx.Conflicto("no_aplica", "Esta cuenta todavía no confirmó su celular.")
	}
	if m.EnviarCodigo == nil {
		return httpx.Conflicto("no_disponible", "El envío de códigos no está disponible.")
	}
	if _, err := m.EnviarCodigo(ctx, celular, "recuperar"); err != nil {
		return err
	}
	m.app.DB.ExecContext(ctx, `INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo) VALUES ($1,$2,$3,'/recuperar','pagos')`, id,
		"Cambia tu contraseña", "VendiGo te pidió cambiar tu contraseña. Te enviamos un código por SMS: úsalo en «¿Olvidaste tu contraseña?».")
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "enviar_cambio_password", "usuario", id, nil)
	httpx.OK(w, map[string]string{"mensaje": "Le enviamos un código por SMS para cambiar su contraseña."})
	return nil
}

// mensaje deja un aviso en la campana del usuario.
func (m *Modulo) mensaje(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Texto string `json:"texto"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Texto = strings.TrimSpace(in.Texto)
	if len([]rune(in.Texto)) < 5 || len([]rune(in.Texto)) > 500 {
		return httpx.Invalido("Escribe un mensaje de 5 a 500 caracteres.")
	}
	id := chi.URLParam(r, "id")
	var rol string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT rol FROM usuarios WHERE id::text=$1`, id).Scan(&rol); err != nil {
		return httpx.ErrNoEncontrado
	}
	enlace := "/vendedor/notificaciones"
	if rol != "vendedor" {
		enlace = "/"
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo) VALUES ($1,'Mensaje de VendiGo',$2,$3,'pagos')`,
		id, in.Texto, enlace); err != nil {
		return err
	}
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "enviar_mensaje", "usuario", id, map[string]string{"texto": in.Texto})
	httpx.OK(w, map[string]string{"mensaje": "Mensaje enviado. Lo verá en sus notificaciones."})
	return nil
}
