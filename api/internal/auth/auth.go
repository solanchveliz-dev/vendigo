package auth

import (
	"context"
	"database/sql"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

type Modulo struct {
	app *core.App
	// TiendaDe devuelve el id de la tienda del usuario (lo registra el módulo de tiendas).
	TiendaDe func(ctx context.Context, usuarioID string) *string
}

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

// RutasPublicas se montan en /auth.
func (m *Modulo) RutasPublicas(r chi.Router) {
	r.Use(httpx.Limite(20, 10*time.Minute))
	r.Method("POST", "/registro", httpx.Handler(m.registro))
	r.Method("POST", "/verificar", httpx.Handler(m.verificar))
	r.Method("POST", "/reenviar", httpx.Handler(m.reenviar))
	r.Method("POST", "/login", httpx.Handler(m.login))
	r.Method("POST", "/refresh", httpx.Handler(m.refresh))
	r.Method("POST", "/logout", httpx.Handler(m.logout))
	r.Method("POST", "/recuperar", httpx.Handler(m.recuperar))
	r.Method("POST", "/restablecer", httpx.Handler(m.restablecer))
}

// RutasPrivadas requieren sesión.
func (m *Modulo) RutasPrivadas(r chi.Router) {
	r.Method("GET", "/me", httpx.Handler(m.yo))
	r.Method("PUT", "/me", httpx.Handler(m.actualizarYo))
	r.Method("PUT", "/me/password", httpx.Handler(m.cambiarPassword))
	r.Method("POST", "/me/cerrar-sesiones", httpx.Handler(m.cerrarSesiones))
	r.Method("GET", "/me/sesiones", httpx.Handler(m.sesiones))
}

var (
	reCelular = regexp.MustCompile(`^9\d{8}$`)
	reEmail   = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
)

const (
	otpDuracion = 10 * time.Minute
	otpIntentos = 5
	otpEspera   = 60 * time.Second
)

func limpiarCelular(c string) string {
	c = strings.ReplaceAll(strings.TrimSpace(c), " ", "")
	return strings.TrimPrefix(c, "+51")
}

type Usuario struct {
	ID       string  `json:"id"`
	Nombre   string  `json:"nombre"`
	Celular  string  `json:"celular"`
	Email    *string `json:"email"`
	Rol      string  `json:"rol"`
	TiendaID *string `json:"tienda_id"`
}

type sesion struct {
	AccessToken  string  `json:"access_token"`
	RefreshToken string  `json:"refresh_token"`
	ExpiraEn     int64   `json:"expira_en"`
	Usuario      Usuario `json:"usuario"`
}

// ---------- registro y código OTP ----------

type registroReq struct {
	Nombre   string `json:"nombre"`
	Celular  string `json:"celular"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Rol      string `json:"rol"`
}

func (m *Modulo) registro(w http.ResponseWriter, r *http.Request) error {
	var in registroReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Nombre = strings.TrimSpace(in.Nombre)
	in.Celular = limpiarCelular(in.Celular)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if len(in.Nombre) < 3 {
		return httpx.Invalido("Escribe tu nombre completo.")
	}
	if !reCelular.MatchString(in.Celular) {
		return httpx.Invalido("El celular debe tener 9 dígitos y empezar con 9.")
	}
	if in.Email != "" && !reEmail.MatchString(in.Email) {
		return httpx.Invalido("El correo no es válido.")
	}
	if len(in.Password) < 8 {
		return httpx.Invalido("La contraseña debe tener al menos 8 caracteres.")
	}
	if in.Rol == "" {
		in.Rol = "comprador"
	}
	if in.Rol != "comprador" && in.Rol != "vendedor" {
		return httpx.Invalido("El tipo de cuenta no es válido.")
	}
	hash, err := seguridad.HashPassword(in.Password)
	if err != nil {
		return err
	}
	var email any
	if in.Email != "" {
		email = in.Email
	}

	ctx := r.Context()
	var verificado bool
	err = m.app.DB.QueryRowContext(ctx, `SELECT celular_verificado FROM usuarios WHERE celular=$1`, in.Celular).Scan(&verificado)
	switch {
	case err == nil && verificado:
		return httpx.Conflicto("celular_registrado", "Este celular ya tiene una cuenta. Inicia sesión.")
	case err == nil:
		// Cuenta creada pero no verificada: se actualizan los datos y se reenvía el código.
		_, err = m.app.DB.ExecContext(ctx, `UPDATE usuarios SET nombre=$2, email=$3, password_hash=$4, rol=$5 WHERE celular=$1`,
			in.Celular, in.Nombre, email, hash, in.Rol)
	case core.SinFilas(err):
		_, err = m.app.DB.ExecContext(ctx, `INSERT INTO usuarios (nombre, celular, email, password_hash, rol) VALUES ($1,$2,$3,$4,$5)`,
			in.Nombre, in.Celular, email, hash, in.Rol)
	}
	if err != nil {
		if strings.Contains(err.Error(), "usuarios_email_key") {
			return httpx.Conflicto("email_registrado", "Este correo ya está en uso.")
		}
		return err
	}
	return m.enviarOTP(w, r, in.Celular, "registro")
}

func (m *Modulo) enviarOTP(w http.ResponseWriter, r *http.Request, celular, proposito string) error {
	ctx := r.Context()
	var ultimo time.Time
	err := m.app.DB.QueryRowContext(ctx, `SELECT creado_en FROM codigos_otp WHERE celular=$1 AND proposito=$2 ORDER BY creado_en DESC LIMIT 1`,
		celular, proposito).Scan(&ultimo)
	if err == nil && time.Since(ultimo) < otpEspera {
		return httpx.NuevoError(http.StatusTooManyRequests, "espera_codigo", "Espera un minuto antes de pedir otro código.")
	}
	codigo := seguridad.CodigoOTP()
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE codigos_otp SET usado=true WHERE celular=$1 AND proposito=$2 AND NOT usado`, celular, proposito); err != nil {
		return err
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO codigos_otp (celular, proposito, codigo_hash, expira_en) VALUES ($1,$2,$3,$4)`,
		celular, proposito, seguridad.HashOTP(m.app.Cfg.JWTSecreto, celular, codigo), time.Now().Add(otpDuracion)); err != nil {
		return err
	}
	if err := m.app.Avisos.EnviarCodigo(ctx, celular, codigo); err != nil {
		return err
	}
	resp := map[string]any{"mensaje": "Te enviamos un código de 6 dígitos.", "celular": celular}
	if m.app.Cfg.EsDev() {
		resp["codigo_dev"] = codigo
	}
	httpx.OK(w, resp)
	return nil
}

// validarOTP marca el código como usado si es correcto.
func (m *Modulo) validarOTP(ctx context.Context, tx *sql.Tx, celular, proposito, codigo string) error {
	var id, hash string
	var intentos int
	var expira time.Time
	err := tx.QueryRowContext(ctx, `SELECT id, codigo_hash, intentos, expira_en FROM codigos_otp
		WHERE celular=$1 AND proposito=$2 AND NOT usado ORDER BY creado_en DESC LIMIT 1 FOR UPDATE`, celular, proposito).
		Scan(&id, &hash, &intentos, &expira)
	if core.SinFilas(err) {
		return httpx.Invalido("Pide un código nuevo.")
	}
	if err != nil {
		return err
	}
	if time.Now().After(expira) || intentos >= otpIntentos {
		return httpx.Invalido("El código venció. Pide uno nuevo.")
	}
	if seguridad.HashOTP(m.app.Cfg.JWTSecreto, celular, strings.TrimSpace(codigo)) != hash {
		tx.ExecContext(ctx, `UPDATE codigos_otp SET intentos=intentos+1 WHERE id=$1`, id)
		return httpx.Invalido("El código no es correcto.")
	}
	_, err = tx.ExecContext(ctx, `UPDATE codigos_otp SET usado=true WHERE id=$1`, id)
	return err
}

type verificarReq struct {
	Celular string `json:"celular"`
	Codigo  string `json:"codigo"`
}

func (m *Modulo) verificar(w http.ResponseWriter, r *http.Request) error {
	var in verificarReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	cel := limpiarCelular(in.Celular)
	ctx := r.Context()
	var uid, rol string
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		// El intento fallido debe guardarse aunque se devuelva error.
		if err := m.validarOTP(ctx, tx, cel, "registro", in.Codigo); err != nil {
			if e, ok := err.(*httpx.Error); ok && e.Mensaje == "El código no es correcto." {
				tx.Commit()
			}
			return err
		}
		return tx.QueryRowContext(ctx, `UPDATE usuarios SET celular_verificado=true WHERE celular=$1 RETURNING id, rol`, cel).Scan(&uid, &rol)
	})
	if err != nil {
		return err
	}
	return m.responderSesion(w, r, uid)
}

type reenviarReq struct {
	Celular   string `json:"celular"`
	Proposito string `json:"proposito"`
}

func (m *Modulo) reenviar(w http.ResponseWriter, r *http.Request) error {
	var in reenviarReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if in.Proposito != "recuperar" {
		in.Proposito = "registro"
	}
	cel := limpiarCelular(in.Celular)
	var existe bool
	m.app.DB.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM usuarios WHERE celular=$1)`, cel).Scan(&existe)
	if !existe {
		httpx.OK(w, map[string]any{"mensaje": "Te enviamos un código de 6 dígitos."})
		return nil
	}
	return m.enviarOTP(w, r, cel, in.Proposito)
}

// ---------- inicio de sesión ----------

type loginReq struct {
	Usuario  string `json:"usuario"`
	Password string `json:"password"`
}

func (m *Modulo) login(w http.ResponseWriter, r *http.Request) error {
	var in loginReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	u := strings.ToLower(strings.TrimSpace(in.Usuario))
	if reCelular.MatchString(limpiarCelular(u)) {
		u = limpiarCelular(u)
	}
	var id, hash, celular string
	var verificado, activo bool
	err := m.app.DB.QueryRowContext(r.Context(), `SELECT id, password_hash, celular, celular_verificado, activo FROM usuarios
		WHERE celular=$1 OR email=$1`, u).Scan(&id, &hash, &celular, &verificado, &activo)
	if core.SinFilas(err) || (err == nil && !seguridad.VerificarPassword(in.Password, hash)) {
		return httpx.NuevoError(http.StatusUnauthorized, "credenciales", "El celular o la contraseña no son correctos.")
	}
	if err != nil {
		return err
	}
	if !activo {
		return httpx.NuevoError(http.StatusForbidden, "cuenta_suspendida", "Tu cuenta está suspendida. Escríbenos a ayuda@vendigo.pe.")
	}
	if !verificado {
		return httpx.NuevoError(http.StatusForbidden, "celular_no_verificado", "Primero verifica tu celular con el código que te enviamos.")
	}
	return m.responderSesion(w, r, id)
}

func (m *Modulo) responderSesion(w http.ResponseWriter, r *http.Request, usuarioID string) error {
	ctx := r.Context()
	u, err := m.cargarUsuario(ctx, usuarioID)
	if err != nil {
		return err
	}
	acceso, err := seguridad.FirmarAcceso(m.app.Cfg.JWTSecreto, u.ID, u.Rol, m.app.Cfg.AccesoDuracion)
	if err != nil {
		return err
	}
	refresh := seguridad.TokenAleatorio()
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_en) VALUES ($1,$2,$3)`,
		u.ID, seguridad.HashSHA256(refresh), time.Now().AddDate(0, 0, m.app.Cfg.RefreshDias)); err != nil {
		return err
	}
	httpx.OK(w, sesion{
		AccessToken:  acceso,
		RefreshToken: refresh,
		ExpiraEn:     time.Now().Add(m.app.Cfg.AccesoDuracion).Unix(),
		Usuario:      u,
	})
	return nil
}

func (m *Modulo) cargarUsuario(ctx context.Context, id string) (Usuario, error) {
	var u Usuario
	err := m.app.DB.QueryRowContext(ctx, `SELECT id, nombre, celular, email, rol FROM usuarios WHERE id=$1`, id).
		Scan(&u.ID, &u.Nombre, &u.Celular, &u.Email, &u.Rol)
	if core.SinFilas(err) {
		return u, httpx.ErrNoAutorizado
	}
	if err == nil && m.TiendaDe != nil {
		u.TiendaID = m.TiendaDe(ctx, u.ID)
	}
	return u, err
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

func (m *Modulo) refresh(w http.ResponseWriter, r *http.Request) error {
	var in refreshReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	var uid string
	err := m.app.DB.QueryRowContext(r.Context(), `UPDATE refresh_tokens SET revocado=true
		WHERE token_hash=$1 AND NOT revocado AND expira_en > now() RETURNING usuario_id`,
		seguridad.HashSHA256(in.RefreshToken)).Scan(&uid)
	if core.SinFilas(err) {
		return httpx.ErrNoAutorizado
	}
	if err != nil {
		return err
	}
	return m.responderSesion(w, r, uid)
}

func (m *Modulo) logout(w http.ResponseWriter, r *http.Request) error {
	var in refreshReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	m.app.DB.ExecContext(r.Context(), `UPDATE refresh_tokens SET revocado=true WHERE token_hash=$1`, seguridad.HashSHA256(in.RefreshToken))
	httpx.OK(w, map[string]string{"mensaje": "Sesión cerrada."})
	return nil
}

// ---------- recuperar contraseña ----------

func (m *Modulo) recuperar(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Celular string `json:"celular"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	cel := limpiarCelular(in.Celular)
	var existe bool
	m.app.DB.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM usuarios WHERE celular=$1 AND celular_verificado)`, cel).Scan(&existe)
	if !existe {
		// No se revela si el celular tiene cuenta.
		httpx.OK(w, map[string]any{"mensaje": "Si el celular tiene cuenta, te enviamos un código."})
		return nil
	}
	return m.enviarOTP(w, r, cel, "recuperar")
}

type restablecerReq struct {
	Celular  string `json:"celular"`
	Codigo   string `json:"codigo"`
	Password string `json:"password"`
}

func (m *Modulo) restablecer(w http.ResponseWriter, r *http.Request) error {
	var in restablecerReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if len(in.Password) < 8 {
		return httpx.Invalido("La contraseña debe tener al menos 8 caracteres.")
	}
	cel := limpiarCelular(in.Celular)
	hash, err := seguridad.HashPassword(in.Password)
	if err != nil {
		return err
	}
	ctx := r.Context()
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if err := m.validarOTP(ctx, tx, cel, "recuperar", in.Codigo); err != nil {
			if e, ok := err.(*httpx.Error); ok && e.Mensaje == "El código no es correcto." {
				tx.Commit()
			}
			return err
		}
		var uid string
		if err := tx.QueryRowContext(ctx, `UPDATE usuarios SET password_hash=$2, password_cambiado_en=now() WHERE celular=$1 RETURNING id`, cel, hash).Scan(&uid); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE refresh_tokens SET revocado=true WHERE usuario_id=$1`, uid)
		return err
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Listo. Ya puedes iniciar sesión con tu nueva contraseña."})
	return nil
}

// ---------- mi cuenta ----------

func (m *Modulo) yo(w http.ResponseWriter, r *http.Request) error {
	u, _ := httpx.UsuarioDe(r.Context())
	us, err := m.cargarUsuario(r.Context(), u.ID)
	if err != nil {
		return err
	}
	httpx.OK(w, us)
	return nil
}

func (m *Modulo) actualizarYo(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Nombre string `json:"nombre"`
		Email  string `json:"email"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Nombre = strings.TrimSpace(in.Nombre)
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if len(in.Nombre) < 3 {
		return httpx.Invalido("Escribe tu nombre completo.")
	}
	if in.Email != "" && !reEmail.MatchString(in.Email) {
		return httpx.Invalido("El correo no es válido.")
	}
	var email any
	if in.Email != "" {
		email = in.Email
	}
	u, _ := httpx.UsuarioDe(r.Context())
	if _, err := m.app.DB.ExecContext(r.Context(), `UPDATE usuarios SET nombre=$2, email=$3 WHERE id=$1`, u.ID, in.Nombre, email); err != nil {
		if strings.Contains(err.Error(), "usuarios_email_key") {
			return httpx.Conflicto("email_registrado", "Este correo ya está en uso.")
		}
		return err
	}
	return m.yo(w, r)
}

// cambiarPassword pide la contraseña actual y cierra las demás sesiones (deja abierta la de este equipo).
func (m *Modulo) cambiarPassword(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Actual       string `json:"actual"`
		Nueva        string `json:"nueva"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if len(in.Nueva) < 8 {
		return httpx.Invalido("La contraseña nueva debe tener al menos 8 caracteres.")
	}
	if in.Nueva == in.Actual {
		return httpx.Invalido("La contraseña nueva debe ser distinta a la actual.")
	}
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	var hash string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT password_hash FROM usuarios WHERE id=$1`, u.ID).Scan(&hash); err != nil {
		return err
	}
	if !seguridad.VerificarPassword(in.Actual, hash) {
		return httpx.Invalido("Tu contraseña actual no es correcta.")
	}
	nuevo, err := seguridad.HashPassword(in.Nueva)
	if err != nil {
		return err
	}
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE usuarios SET password_hash=$2, password_cambiado_en=now() WHERE id=$1`, u.ID, nuevo); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE refresh_tokens SET revocado=true WHERE usuario_id=$1 AND NOT revocado AND token_hash<>$2`,
			u.ID, seguridad.HashSHA256(in.RefreshToken))
		return err
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Listo, cambiaste tu contraseña."})
	return nil
}

// cerrarSesiones cierra la cuenta en los otros equipos; este sigue abierto.
func (m *Modulo) cerrarSesiones(w http.ResponseWriter, r *http.Request) error {
	var in refreshReq
	if r.ContentLength > 0 {
		if err := httpx.Leer(r, &in); err != nil {
			return err
		}
	}
	u, _ := httpx.UsuarioDe(r.Context())
	res, err := m.app.DB.ExecContext(r.Context(), `UPDATE refresh_tokens SET revocado=true
		WHERE usuario_id=$1 AND NOT revocado AND expira_en > now() AND token_hash<>$2`, u.ID, seguridad.HashSHA256(in.RefreshToken))
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	httpx.OK(w, map[string]any{"cerradas": n})
	return nil
}

// sesiones dice en cuántos equipos está abierta la cuenta (incluye este).
func (m *Modulo) sesiones(w http.ResponseWriter, r *http.Request) error {
	u, _ := httpx.UsuarioDe(r.Context())
	var n int
	var cambiada, creada time.Time
	var pc *time.Time
	if err := m.app.DB.QueryRowContext(r.Context(), `SELECT (SELECT count(*) FROM refresh_tokens
		WHERE usuario_id=$1 AND NOT revocado AND expira_en > now()), password_cambiado_en, creado_en FROM usuarios WHERE id=$1`, u.ID).Scan(&n, &pc, &creada); err != nil {
		return err
	}
	// Si nunca la cambió, cuenta desde que creó la cuenta.
	cambiada = creada
	if pc != nil {
		cambiada = *pc
	}
	httpx.OK(w, map[string]any{"abiertas": n, "password_cambiado_en": cambiada})
	return nil
}
