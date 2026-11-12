package admin

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/cuentas"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// SolicitudCelular es un pedido de cambio de número de alguien que perdió el suyo.
type SolicitudCelular struct {
	ID              string     `json:"id"`
	UsuarioID       string     `json:"usuario_id"`
	Nombre          string     `json:"nombre"`
	Tienda          string     `json:"tienda"`
	CelularAnterior string     `json:"celular_anterior"`
	CelularNuevo    string     `json:"celular_nuevo"`
	Estado          string     `json:"estado"`
	Motivo          string     `json:"motivo_rechazo"`
	IP              string     `json:"ip"`
	CreadoEn        time.Time  `json:"creado_en"`
	RevisadoEn      *time.Time `json:"revisado_en"`
	// Solo en el detalle: fotos nuevas y las de su verificación aprobada, para compararlas.
	Frente           string `json:"frente,omitempty"`
	Selfie           string `json:"selfie,omitempty"`
	FrenteVerificado string `json:"frente_verificado,omitempty"`
	SelfieVerificada string `json:"selfie_verificada,omitempty"`
	NombreDocumento  string `json:"nombre_documento,omitempty"`
}

const consultaSolicitud = `SELECT s.id::text, s.usuario_id::text, u.nombre, COALESCE(t.nombre, ''), s.celular_anterior, s.celular_nuevo,
	s.estado, s.motivo_rechazo, s.ip, s.creado_en, s.revisado_en
	FROM solicitudes_celular s JOIN usuarios u ON u.id=s.usuario_id LEFT JOIN tiendas t ON t.usuario_id=u.id`

func scanSolicitud(f interface{ Scan(...any) error }) (SolicitudCelular, error) {
	var s SolicitudCelular
	err := f.Scan(&s.ID, &s.UsuarioID, &s.Nombre, &s.Tienda, &s.CelularAnterior, &s.CelularNuevo, &s.Estado, &s.Motivo, &s.IP, &s.CreadoEn, &s.RevisadoEn)
	return s, err
}

func (m *Modulo) cambiosCelular(w http.ResponseWriter, r *http.Request) error {
	estado := r.URL.Query().Get("estado")
	if estado == "" {
		estado = "pendiente"
	}
	rows, err := m.app.DB.QueryContext(r.Context(), consultaSolicitud+` WHERE s.estado=$1 OR $1='todas' ORDER BY s.creado_en DESC LIMIT 100`, estado)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []SolicitudCelular{}
	for rows.Next() {
		s, err := scanSolicitud(rows)
		if err != nil {
			return err
		}
		out = append(out, s)
	}
	httpx.OK(w, map[string]any{"solicitudes": out})
	return rows.Err()
}

func (m *Modulo) cambioCelular(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	s, err := scanSolicitud(m.app.DB.QueryRowContext(ctx, consultaSolicitud+` WHERE s.id::text=$1`, id))
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	var frente, selfie string
	m.app.DB.QueryRowContext(ctx, `SELECT frente_key, selfie_key FROM solicitudes_celular WHERE id::text=$1`, id).Scan(&frente, &selfie)
	s.Frente, s.Selfie = m.urlPrivada(ctx, frente), m.urlPrivada(ctx, selfie)
	var vf, vs, nombre string
	m.app.DB.QueryRowContext(ctx, `SELECT v.frente_key, COALESCE(v.selfie_key, ''), v.nombre_completo FROM verificaciones v
		JOIN tiendas t ON t.id=v.tienda_id WHERE t.usuario_id::text=$1 AND v.clase='identidad' AND v.estado='aprobada'
		ORDER BY v.revisado_en DESC NULLS LAST LIMIT 1`, s.UsuarioID).Scan(&vf, &vs, &nombre)
	s.FrenteVerificado, s.SelfieVerificada, s.NombreDocumento = m.urlPrivada(ctx, vf), m.urlPrivada(ctx, vs), nombre
	m.app.Auditar(ctx, m.app.DB, adminID(ctx), "ver_documento", "solicitud_celular", id, nil)
	httpx.OK(w, s)
	return nil
}

func (m *Modulo) aprobarCambioCelular(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	if err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		return cuentas.Aprobar(ctx, tx, m.app, id, adminID(ctx))
	}); err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Número cambiado. Cerramos todas sus sesiones y le avisamos por SMS al número nuevo."})
	return nil
}

func (m *Modulo) rechazarCambioCelular(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	motivo, err := motivoObligatorio(r)
	if err != nil {
		return err
	}
	id := chi.URLParam(r, "id")
	if err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		return cuentas.Rechazar(ctx, tx, m.app, id, adminID(ctx), motivo)
	}); err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Solicitud rechazada. Le avisamos por SMS al número nuevo."})
	return nil
}
