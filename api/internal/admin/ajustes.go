package admin

import (
	"context"
	"fmt"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/planes"
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

// Ajustes de los ingresos extra (en céntimos o días) con su valor por defecto y su rango permitido.
var extrasPorDefecto = map[string]int{"garantia_tope_centimos": 15000, "garantia_dias_habiles": 5, "destacado_precio_centimos": 500, "destacado_dias": 7}
var limitesExtras = map[string][2]int{"garantia_tope_centimos": {1000, 500000}, "garantia_dias_habiles": {1, 30}, "destacado_precio_centimos": {100, 100000}, "destacado_dias": {1, 60}}

func (m *Modulo) configuracion(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var d struct {
		Correo        string              `json:"correo_soporte"`
		PlanesYape    string              `json:"planes_yape"`
		PlanesTitular string              `json:"planes_titular"`
		Inactividad   int                 `json:"inactividad_min"`
		Agencias      []string            `json:"agencias"`
		Sedes         int                 `json:"sedes_activas"`
		Extras        map[string]int      `json:"extras"` // precio de impulsos, tope y plazo del fondo de emergencia
		Cobro         planes.CobroVendiGo `json:"cobro_vendigo"`
	}
	d.Correo = m.correoSoporte(ctx)
	d.Cobro = planes.LeerCobro(ctx, m.app.DB)
	d.Extras = map[string]int{}
	for k, def := range extrasPorDefecto {
		v := def
		m.app.DB.QueryRowContext(ctx, `SELECT valor::int FROM ajustes_plataforma WHERE clave=$1`, k).Scan(&v)
		d.Extras[k] = v
	}
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
		Correo        string               `json:"correo_soporte"`
		PlanesYape    string               `json:"planes_yape"`
		PlanesTitular string               `json:"planes_titular"`
		Extras        map[string]int       `json:"extras"`
		Cobro         *planes.CobroVendiGo `json:"cobro_vendigo"`
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
	// Los datos de cobro de VendiGo solo se tocan si vienen (cobro_vendigo o, por compatibilidad, planes_yape).
	valores := map[string]string{"correo_soporte": in.Correo}
	if in.Cobro == nil && in.PlanesYape != "" {
		valores["planes_yape"], valores["planes_titular"] = in.PlanesYape, in.PlanesTitular
	}
	if c := in.Cobro; c != nil {
		if err := validarCobro(c); err != nil {
			return err
		}
		for k, v := range map[string]string{"planes_yape": c.Yape, "planes_plin": c.Plin, "planes_titular": c.Titular, "planes_tarjeta_link": c.TarjetaLink,
			"planes_tarjeta_marcas": strings.Join(c.TarjetaMarcas, ","), "planes_banco": c.Banco, "planes_cuenta": c.Cuenta, "planes_cci": c.CCI, "planes_banco_titular": c.BancoTitular} {
			valores[k] = v
		}
	}
	for k, v := range in.Extras {
		lim, ok := limitesExtras[k]
		if !ok {
			return httpx.Invalido("Ajuste desconocido: " + k)
		}
		if v < lim[0] || v > lim[1] {
			return httpx.Invalido(fmt.Sprintf("Valor fuera de rango para %s.", k))
		}
		valores[k] = strconv.Itoa(v)
	}
	for k, v := range valores {
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

// validarCobro revisa los métodos con los que las tiendas le pagan a VendiGo.
func validarCobro(c *planes.CobroVendiGo) error {
	for _, p := range []*string{&c.Yape, &c.Plin, &c.Titular, &c.TarjetaLink, &c.Banco, &c.Cuenta, &c.CCI, &c.BancoTitular} {
		*p = strings.TrimSpace(*p)
	}
	c.CCI = strings.ReplaceAll(c.CCI, "-", "")
	digitos := func(x string) bool { return x != "" && strings.Trim(x, "0123456789") == "" }
	celular := func(x string) bool { return x == "" || (len(x) == 9 && x[0] == '9' && digitos(x)) }
	cuenta := strings.ReplaceAll(c.Cuenta, "-", "")
	transf := c.Cuenta != "" || c.CCI != ""
	switch {
	case !celular(c.Yape) || !celular(c.Plin):
		return httpx.Invalido("El Yape y el Plin de VendiGo deben ser celulares de 9 dígitos que empiecen con 9.")
	case (c.Yape != "" || c.Plin != "") && len([]rune(c.Titular)) < 3:
		return httpx.Invalido("Escribe el titular del Yape/Plin de VendiGo.")
	case c.TarjetaLink != "" && (!strings.HasPrefix(c.TarjetaLink, "https://") || len(c.TarjetaLink) > 300):
		return httpx.Invalido("El link de pago con tarjeta debe empezar con https://")
	case transf && (c.Banco == "" || len([]rune(c.BancoTitular)) < 3):
		return httpx.Invalido("Completa el banco y el titular de la cuenta de VendiGo.")
	case c.Cuenta != "" && (!digitos(cuenta) || len(cuenta) < 10 || len(cuenta) > 20):
		return httpx.Invalido("El número de cuenta debe tener entre 10 y 20 dígitos.")
	case c.CCI != "" && (!digitos(c.CCI) || len(c.CCI) != 20):
		return httpx.Invalido("El CCI debe tener 20 dígitos.")
	}
	if c.TarjetaLink == "" {
		c.TarjetaMarcas = nil
	}
	return nil
}
