package admin

import (
	"context"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Agencias de envío, configuración general y la bandeja de avisos del admin.

type Sede struct {
	ID        string `json:"id"`
	Agencia   string `json:"agencia"`
	Ciudad    string `json:"ciudad"`
	Nombre    string `json:"nombre"`
	Direccion string `json:"direccion"`
	Activa    bool   `json:"activa"`
}

func (m *Modulo) agencias(w http.ResponseWriter, r *http.Request) error {
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT id, agencia, ciudad, nombre, direccion, activa FROM agencias_sedes ORDER BY agencia, ciudad, nombre`)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []Sede{}
	for rows.Next() {
		var s Sede
		if err := rows.Scan(&s.ID, &s.Agencia, &s.Ciudad, &s.Nombre, &s.Direccion, &s.Activa); err != nil {
			return err
		}
		out = append(out, s)
	}
	httpx.OK(w, map[string]any{"sedes": out})
	return nil
}

func leerSede(r *http.Request) (Sede, error) {
	var s Sede
	if err := httpx.Leer(r, &s); err != nil {
		return s, err
	}
	for _, c := range []*string{&s.Agencia, &s.Ciudad, &s.Nombre, &s.Direccion} {
		*c = strings.TrimSpace(*c)
		if len([]rune(*c)) < 2 || len([]rune(*c)) > 150 {
			return s, httpx.Invalido("Completa agencia, ciudad, nombre y dirección.")
		}
	}
	return s, nil
}

func (m *Modulo) guardarSede(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	s, err := leerSede(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		err = m.app.DB.QueryRowContext(ctx, `INSERT INTO agencias_sedes (agencia, ciudad, nombre, direccion) VALUES ($1,$2,$3,$4) RETURNING id`,
			s.Agencia, s.Ciudad, s.Nombre, s.Direccion).Scan(&id)
	} else {
		var res interface{ RowsAffected() (int64, error) }
		res, err = m.app.DB.ExecContext(ctx, `UPDATE agencias_sedes SET agencia=$2, ciudad=$3, nombre=$4, direccion=$5 WHERE id::text=$1`, id, s.Agencia, s.Ciudad, s.Nombre, s.Direccion)
		if err == nil {
			if n, _ := res.RowsAffected(); n == 0 {
				return httpx.ErrNoEncontrado
			}
		}
	}
	if err != nil {
		if strings.Contains(err.Error(), "agencias_sedes_agencia_nombre_key") {
			return httpx.Conflicto("repetida", "Ya existe una sede con ese nombre en esa agencia.")
		}
		return err
	}
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "guardar_agencia", "agencia", id, map[string]string{"nombre": s.Nombre})
	httpx.OK(w, map[string]string{"mensaje": "Agencia guardada."})
	return nil
}

func (m *Modulo) activarSede(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	var activa bool
	err := m.app.DB.QueryRowContext(ctx, `UPDATE agencias_sedes SET activa=NOT activa WHERE id::text=$1 RETURNING activa`, id).Scan(&activa)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "estado_agencia", "agencia", id, map[string]bool{"activa": activa})
	msg := "Agencia desactivada: el comprador ya no la verá."
	if activa {
		msg = "Agencia activada."
	}
	httpx.OK(w, map[string]string{"mensaje": msg})
	return nil
}

// CorreoSoporte es el correo que se muestra en los avisos que envía el equipo.
func (m *Modulo) correoSoporte(ctx context.Context) string {
	c := "ayuda@vendigo.pe"
	m.app.DB.QueryRowContext(ctx, `SELECT valor FROM ajustes_plataforma WHERE clave='correo_soporte'`).Scan(&c)
	return c
}

func (m *Modulo) configuracion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var d struct {
		Correo        string   `json:"correo_soporte"`
		PlanesYape    string   `json:"planes_yape"`
		PlanesTitular string   `json:"planes_titular"`
		Inactividad   int      `json:"inactividad_min"`
		Agencias      []string `json:"agencias"`
		Sedes         int      `json:"sedes_activas"`
	}
	d.Correo = m.correoSoporte(ctx)
	m.app.DB.QueryRowContext(ctx, `SELECT COALESCE((SELECT valor FROM ajustes_plataforma WHERE clave='planes_yape'),''), COALESCE((SELECT valor FROM ajustes_plataforma WHERE clave='planes_titular'),'')`).Scan(&d.PlanesYape, &d.PlanesTitular)
	d.Inactividad = 30
	m.app.DB.QueryRowContext(ctx, `SELECT valor::int FROM ajustes_plataforma WHERE clave='inactividad_admin_min'`).Scan(&d.Inactividad)
	d.Agencias = []string{}
	if rows, err := m.app.DB.QueryContext(ctx, `SELECT agencia, count(*) FROM agencias_sedes WHERE activa GROUP BY agencia ORDER BY count(*) DESC`); err == nil {
		for rows.Next() {
			var a string
			var n int
			rows.Scan(&a, &n)
			d.Agencias = append(d.Agencias, a)
			d.Sedes += n
		}
		rows.Close()
	}
	httpx.OK(w, d)
	return nil
}

func (m *Modulo) guardarConfiguracion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Correo        string `json:"correo_soporte"`
		PlanesYape    string `json:"planes_yape"`
		PlanesTitular string `json:"planes_titular"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Correo = strings.ToLower(strings.TrimSpace(in.Correo))
	if a, err := mail.ParseAddress(in.Correo); err != nil || a.Address != in.Correo {
		return httpx.Invalido("Escribe un correo de soporte válido.")
	}
	in.PlanesYape, in.PlanesTitular = strings.TrimSpace(in.PlanesYape), strings.TrimSpace(in.PlanesTitular)
	if in.PlanesYape != "" && (len(in.PlanesYape) != 9 || in.PlanesYape[0] != '9' || strings.Trim(in.PlanesYape, "0123456789") != "") {
		return httpx.Invalido("El Yape de VendiGo debe ser un celular de 9 dígitos que empiece con 9.")
	}
	for k, v := range map[string]string{"correo_soporte": in.Correo, "planes_yape": in.PlanesYape, "planes_titular": in.PlanesTitular} {
		if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO ajustes_plataforma (clave, valor) VALUES ($1, $2)
			ON CONFLICT (clave) DO UPDATE SET valor=$2, actualizado_en=now()`, k, v); err != nil {
			return err
		}
	}
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "editar_configuracion", "ajustes", "correo_soporte", map[string]string{"correo": in.Correo})
	httpx.OK(w, map[string]string{"mensaje": "Configuración guardada."})
	return nil
}

func (m *Modulo) bandeja(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id, titulo, cuerpo, COALESCE(enlace,''), tipo, leida, creado_en FROM notificaciones
		WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 300`, adminID(ctx))
	if err != nil {
		return err
	}
	defer rows.Close()
	type aviso struct {
		ID     string    `json:"id"`
		Titulo string    `json:"titulo"`
		Cuerpo string    `json:"cuerpo"`
		Enlace string    `json:"enlace"`
		Tipo   string    `json:"tipo"`
		Leida  bool      `json:"leida"`
		Fecha  time.Time `json:"creado_en"`
	}
	out := []aviso{}
	for rows.Next() {
		var a aviso
		rows.Scan(&a.ID, &a.Titulo, &a.Cuerpo, &a.Enlace, &a.Tipo, &a.Leida, &a.Fecha)
		out = append(out, a)
	}
	httpx.OK(w, map[string]any{"notificaciones": out})
	return nil
}

func (m *Modulo) leerAviso(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	q := `UPDATE notificaciones SET leida=true WHERE usuario_id=$1 AND NOT leida`
	args := []any{adminID(ctx)}
	if id := chi.URLParam(r, "id"); id != "" {
		q += ` AND id::text=$2`
		args = append(args, id)
	}
	if _, err := m.app.DB.ExecContext(ctx, q, args...); err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Listo."})
	return nil
}
