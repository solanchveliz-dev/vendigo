package auth

import (
	"context"
	"database/sql"
	"fmt"
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
	r.Method("POST", "/mfa", httpx.Handler(m.mfa))
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
	r.Method("GET", "/me/accesos", httpx.Handler(m.accesos))
	r.Method("GET", "/me/mfa", httpx.Handler(m.estadoMFA))
	r.Method("POST", "/me/mfa/iniciar", httpx.Handler(m.iniciarMFA))
	r.Method("POST", "/me/mfa/activar", httpx.Handler(m.activarMFA))
	r.Method("POST", "/me/mfa/desactivar", httpx.Handler(m.desactivarMFA))
	r.Method("POST", "/me/confirmar", httpx.Handler(m.pedirConfirmacion))
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
	CodigosRespaldo []string `json:"codigos_respaldo,omitempty"`
	AccessToken     string   `json:"access_token"`
	RefreshToken    string   `json:"refresh_token"`
	ExpiraEn        int64    `json:"expira_en"`
	Usuario         Usuario  `json:"usuario"`
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
	if msg := seguridad.ValidarPassword(in.Password); msg != "" {
		return httpx.Invalido(msg)
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

// GenerarOTP crea un código de 6 dígitos y lo envía por SMS (también lo usa el admin para
// "Enviar cambio de contraseña"). Devuelve el código solo para el modo de prueba.
func (m *Modulo) GenerarOTP(ctx context.Context, celular, proposito string) (string, error) {
	var ultimo time.Time
	err := m.app.DB.QueryRowContext(ctx, `SELECT creado_en FROM codigos_otp WHERE celular=$1 AND proposito=$2 ORDER BY creado_en DESC LIMIT 1`,
		celular, proposito).Scan(&ultimo)
	if err == nil && time.Since(ultimo) < otpEspera {
		return "", httpx.NuevoError(http.StatusTooManyRequests, "espera_codigo", "Espera un minuto antes de pedir otro código.")
	}
	codigo := seguridad.CodigoOTP()
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE codigos_otp SET usado=true WHERE celular=$1 AND proposito=$2 AND NOT usado`, celular, proposito); err != nil {
		return "", err
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO codigos_otp (celular, proposito, codigo_hash, expira_en) VALUES ($1,$2,$3,$4)`,
		celular, proposito, seguridad.HashOTP(m.app.Cfg.JWTSecreto, celular, codigo), time.Now().Add(otpDuracion)); err != nil {
		return "", err
	}
	if err := m.app.Avisos.EnviarCodigo(ctx, celular, codigo); err != nil {
		return "", err
	}
	return codigo, nil
}

func (m *Modulo) enviarOTP(w http.ResponseWriter, r *http.Request, celular, proposito string, extra ...map[string]any) error {
	codigo, err := m.GenerarOTP(r.Context(), celular, proposito)
	if err != nil {
		return err
	}
	resp := map[string]any{"mensaje": "Te enviamos un código de 6 dígitos.", "celular": celular}
	for _, e := range extra {
		for k, v := range e {
			resp[k] = v
		}
	}
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
	ctx := r.Context()
	var id, hash, celular string
	var verificado, activo bool
	var bloqueado *time.Time
	var rol string
	var totpActivo bool
	err := m.app.DB.QueryRowContext(ctx, `SELECT id, password_hash, celular, celular_verificado, activo, bloqueado_hasta, rol, totp_activo FROM usuarios
		WHERE celular=$1 OR email=$1`, u).Scan(&id, &hash, &celular, &verificado, &activo, &bloqueado, &rol, &totpActivo)
	if core.SinFilas(err) {
		return httpx.NuevoError(http.StatusUnauthorized, "credenciales", "El celular o la contraseña no son correctos.")
	}
	if err != nil {
		return err
	}
	if bloqueado != nil && time.Now().Before(*bloqueado) {
		min := int(time.Until(*bloqueado).Minutes()) + 1
		m.registrarAcceso(r, id, false, "cuenta bloqueada")
		return httpx.NuevoError(http.StatusTooManyRequests, "cuenta_bloqueada",
			fmt.Sprintf("Por seguridad bloqueamos tu cuenta %d min por varios intentos fallidos. Si olvidaste tu contraseña, recupérala.", min))
	}
	if !seguridad.VerificarPassword(in.Password, hash) {
		// Tras 5 intentos fallidos seguidos la cuenta se bloquea 15 minutos.
		var intentos int
		m.app.DB.QueryRowContext(ctx, `UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1,
			bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2 THEN now() + $3::interval ELSE bloqueado_hasta END
			WHERE id=$1 RETURNING intentos_fallidos`, id, maxIntentos, bloqueoDuracion).Scan(&intentos)
		m.registrarAcceso(r, id, false, "contraseña incorrecta")
		if intentos >= maxIntentos {
			m.app.DB.ExecContext(ctx, `UPDATE usuarios SET intentos_fallidos=0 WHERE id=$1`, id)
			avisoSeguridad(ctx, m.app.DB, id, "Bloqueamos tu cuenta 15 minutos", "Alguien intentó entrar varias veces con una contraseña incorrecta. Si no fuiste tú, cambia tu contraseña.")
			return httpx.NuevoError(http.StatusTooManyRequests, "cuenta_bloqueada", "Por seguridad bloqueamos tu cuenta 15 min por varios intentos fallidos. Si olvidaste tu contraseña, recupérala.")
		}
		if quedan := maxIntentos - intentos; quedan <= 2 {
			return httpx.NuevoError(http.StatusUnauthorized, "credenciales", fmt.Sprintf("El celular o la contraseña no son correctos. Te quedan %d %s antes de bloquear tu cuenta.", quedan, map[bool]string{true: "intento", false: "intentos"}[quedan == 1]))
		}
		return httpx.NuevoError(http.StatusUnauthorized, "credenciales", "El celular o la contraseña no son correctos.")
	}
	if !activo {
		m.registrarAcceso(r, id, false, "cuenta suspendida")
		return httpx.NuevoError(http.StatusForbidden, "cuenta_suspendida", "Tu cuenta está suspendida. Escríbenos a ayuda@vendigo.pe.")
	}
	if !verificado {
		return httpx.NuevoError(http.StatusForbidden, "celular_no_verificado", "Primero verifica tu celular con el código que te enviamos.")
	}
	m.app.DB.ExecContext(ctx, `UPDATE usuarios SET intentos_fallidos=0, bloqueado_hasta=NULL WHERE id=$1`, id)
	if rol == "admin" {
		// Los administradores entran con su correo de la empresa y siempre con el código de su app.
		if !strings.Contains(u, "@") {
			m.registrarAcceso(r, id, false, "admin intentó entrar con celular")
			return httpx.NuevoError(http.StatusForbidden, "admin_con_correo", "Las cuentas de administrador ingresan con su correo de la empresa.")
		}
		return m.desafioMFA(w, r, id)
	}
	if totpActivo {
		// Vendedora que activó la verificación en dos pasos.
		return m.desafioMFA(w, r, id)
	}
	m.avisarEquipoNuevo(r, id)
	m.registrarAcceso(r, id, true, "")
	return m.responderSesion(w, r, id)
}

func (m *Modulo) responderSesion(w http.ResponseWriter, r *http.Request, usuarioID string) error {
	s, err := m.crearSesion(r.Context(), usuarioID)
	if err != nil {
		return err
	}
	httpx.OK(w, s)
	return nil
}

func (m *Modulo) crearSesion(ctx context.Context, usuarioID string) (sesion, error) {
	u, err := m.cargarUsuario(ctx, usuarioID)
	if err != nil {
		return sesion{}, err
	}
	acceso, err := seguridad.FirmarAcceso(m.app.Cfg.JWTSecreto, u.ID, u.Rol, m.app.Cfg.AccesoDuracion)
	if err != nil {
		return sesion{}, err
	}
	refresh := seguridad.TokenAleatorio()
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_en) VALUES ($1,$2,$3)`,
		u.ID, seguridad.HashSHA256(refresh), time.Now().AddDate(0, 0, m.app.Cfg.RefreshDias)); err != nil {
		return sesion{}, err
	}
	return sesion{
		AccessToken:  acceso,
		RefreshToken: refresh,
		ExpiraEn:     time.Now().Add(m.app.Cfg.AccesoDuracion).Unix(),
		Usuario:      u,
	}, nil
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
	var creado time.Time
	err := m.app.DB.QueryRowContext(r.Context(), `UPDATE refresh_tokens SET revocado=true
		WHERE token_hash=$1 AND NOT revocado AND expira_en > now() RETURNING usuario_id, creado_en`,
		seguridad.HashSHA256(in.RefreshToken)).Scan(&uid, &creado)
	if core.SinFilas(err) {
		return httpx.ErrNoAutorizado
	}
	if err != nil {
		return err
	}
	var activo bool
	var rol string
	m.app.DB.QueryRowContext(r.Context(), `SELECT activo, rol FROM usuarios WHERE id=$1`, uid).Scan(&activo, &rol)
	// Las sesiones de administrador se cierran tras 30 minutos sin uso.
	if rol == "admin" && time.Since(creado) > m.inactividadAdmin(r.Context()) {
		return httpx.NuevoError(http.StatusUnauthorized, "sesion_inactiva", "Cerramos tu sesión por inactividad. Vuelve a ingresar.")
	}
	if !activo {
		return httpx.NuevoError(http.StatusForbidden, "cuenta_suspendida", "Tu cuenta está suspendida. Escríbenos a ayuda@vendigo.pe.")
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
	if msg := seguridad.ValidarPassword(in.Password); msg != "" {
		return httpx.Invalido(msg)
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
		// Al recuperar la contraseña también se quita el bloqueo por intentos fallidos.
		if err := tx.QueryRowContext(ctx, `UPDATE usuarios SET password_hash=$2, password_cambiado_en=now(), intentos_fallidos=0, bloqueado_hasta=NULL
			WHERE celular=$1 RETURNING id`, cel, hash).Scan(&uid); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE refresh_tokens SET revocado=true WHERE usuario_id=$1`, uid); err != nil {
			return err
		}
		avisoSeguridad(ctx, tx, uid, "Recuperaste tu contraseña", "Cerramos tu cuenta en todos los equipos. Si no fuiste tú, escríbenos a ayuda@vendigo.pe.")
		m.app.Auditar(ctx, tx, uid, "recuperar_password", "usuario", uid, nil)
		return nil
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
	if msg := seguridad.ValidarPassword(in.Nueva); msg != "" {
		return httpx.Invalido(msg)
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
	avisoSeguridad(ctx, m.app.DB, u.ID, "Cambiaste tu contraseña", "Si no fuiste tú, recupera tu cuenta de inmediato desde «¿Olvidaste tu contraseña?».")
	m.app.Auditar(ctx, m.app.DB, u.ID, "cambiar_password", "usuario", u.ID, nil)
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

// ---------- seguridad de la cuenta ----------

const (
	maxIntentos     = 5
	bloqueoDuracion = "15 minutes"
)

func agente(r *http.Request) string {
	a := r.Header.Get("User-Agent")
	if len(a) > 300 {
		a = a[:300]
	}
	return a
}

func (m *Modulo) registrarAcceso(r *http.Request, usuarioID string, exito bool, motivo string) {
	m.app.DB.ExecContext(r.Context(), `INSERT INTO accesos (usuario_id, exito, motivo, ip, agente) VALUES ($1,$2,$3,$4,$5)`,
		usuarioID, exito, motivo, httpx.IP(r), agente(r))
}

// avisarEquipoNuevo avisa si la cuenta entra desde un navegador con el que nunca había entrado.
func (m *Modulo) avisarEquipoNuevo(r *http.Request, usuarioID string) {
	var antes, conEste bool
	m.app.DB.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM accesos WHERE usuario_id=$1 AND exito),
		EXISTS(SELECT 1 FROM accesos WHERE usuario_id=$1 AND exito AND agente=$2)`, usuarioID, agente(r)).Scan(&antes, &conEste)
	if antes && !conEste {
		avisoSeguridad(r.Context(), m.app.DB, usuarioID, "Nuevo inicio de sesión",
			"Entraron a tu cuenta desde "+Equipo(agente(r))+". Si no fuiste tú, cambia tu contraseña y cierra las otras sesiones.")
	}
}

// avisoSeguridad deja un aviso en la campana de la persona (siempre llega, no se puede apagar).
func avisoSeguridad(ctx context.Context, q core.Ejecutor, usuarioID, titulo, cuerpo string) {
	q.ExecContext(ctx, `INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo)
		SELECT id, $2, $3, CASE WHEN rol='admin' THEN '/admin/seguridad' ELSE '/vendedor/configuracion' END,
		CASE WHEN rol='admin' THEN 'seguridad' ELSE 'pagos' END FROM usuarios WHERE id=$1`, usuarioID, titulo, cuerpo)
}

// Equipo describe el navegador y sistema a partir del User-Agent ("Chrome en Mac").
func Equipo(ua string) string {
	nav := "un navegador"
	switch {
	case strings.Contains(ua, "Edg/"):
		nav = "Edge"
	case strings.Contains(ua, "OPR/"):
		nav = "Opera"
	case strings.Contains(ua, "Chrome/"):
		nav = "Chrome"
	case strings.Contains(ua, "Firefox/"):
		nav = "Firefox"
	case strings.Contains(ua, "Safari/"):
		nav = "Safari"
	}
	so := ""
	switch {
	case strings.Contains(ua, "iPhone"), strings.Contains(ua, "iPad"):
		so = "iPhone"
	case strings.Contains(ua, "Android"):
		so = "Android"
	case strings.Contains(ua, "Mac OS"):
		so = "Mac"
	case strings.Contains(ua, "Windows"):
		so = "Windows"
	case strings.Contains(ua, "Linux"):
		so = "Linux"
	}
	if so == "" {
		return nav
	}
	return nav + " en " + so
}

// accesos: últimos ingresos a la cuenta, para revisar si hubo algo raro.
func (m *Modulo) accesos(w http.ResponseWriter, r *http.Request) error {
	u, _ := httpx.UsuarioDe(r.Context())
	rows, err := m.app.DB.QueryContext(r.Context(), `SELECT exito, motivo, ip, agente, creado_en FROM accesos
		WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 15`, u.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type acceso struct {
		Exito  bool      `json:"exito"`
		Motivo string    `json:"motivo"`
		IP     string    `json:"ip"`
		Equipo string    `json:"equipo"`
		Fecha  time.Time `json:"creado_en"`
	}
	out := []acceso{}
	for rows.Next() {
		var a acceso
		var ag string
		rows.Scan(&a.Exito, &a.Motivo, &a.IP, &ag, &a.Fecha)
		a.Equipo = Equipo(ag)
		out = append(out, a)
	}
	httpx.OK(w, map[string]any{"accesos": out})
	return nil
}
