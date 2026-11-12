package auth

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/solanchveliz-dev/vendigo/api/internal/cuentas"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// ---------- cambiar el número con sesión ----------

// celularNuevo valida el formato y que no sea de otra cuenta.
func (m *Modulo) celularNuevo(r *http.Request, crudo, excepto string) (string, error) {
	cel := limpiarCelular(crudo)
	if !reCelular.MatchString(cel) {
		return "", httpx.Invalido("Escribe un celular de 9 dígitos que empiece con 9.")
	}
	var dueno string
	err := m.app.DB.QueryRowContext(r.Context(), `SELECT id::text FROM usuarios WHERE celular=$1`, cel).Scan(&dueno)
	if err == nil {
		if dueno == excepto {
			return "", httpx.Invalido("Ese ya es tu número.")
		}
		return "", httpx.Conflicto("celular_en_uso", "Ese número ya está registrado en otra cuenta de VendiGo.")
	}
	if err != sql.ErrNoRows {
		return "", err
	}
	return cel, nil
}

// codigoCelularNuevo envía un código al número nuevo para comprobar que la persona lo tiene.
func (m *Modulo) codigoCelularNuevo(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		CelularNuevo string `json:"celular_nuevo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(r.Context())
	cel, err := m.celularNuevo(r, in.CelularNuevo, u.ID)
	if err != nil {
		return err
	}
	return m.enviarOTP(w, r, cel, "cambio_celular")
}

// cambiarCelular pide la contraseña, el código del número nuevo y, si usa app autenticadora, su código.
// Deja abierta la sesión de este equipo y cierra las demás.
func (m *Modulo) cambiarCelular(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		CelularNuevo   string `json:"celular_nuevo"`
		Codigo         string `json:"codigo"`
		Password       string `json:"password"`
		CodigoDosPasos string `json:"codigo_dos_pasos"`
		RefreshToken   string `json:"refresh_token"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	ctx := r.Context()
	u, _ := httpx.UsuarioDe(ctx)
	cel, err := m.celularNuevo(r, in.CelularNuevo, u.ID)
	if err != nil {
		return err
	}
	var hash string
	var totp bool
	// Con segundo paso por SMS no se pide otro código: el SMS llegaría al número que se está cambiando.
	if err := m.app.DB.QueryRowContext(ctx, `SELECT password_hash, totp_activo AND mfa_metodo='app' FROM usuarios WHERE id=$1`, u.ID).Scan(&hash, &totp); err != nil {
		return err
	}
	if !seguridad.VerificarPassword(in.Password, hash) {
		return httpx.Invalido("Tu contraseña no es correcta.")
	}
	if totp {
		if err := m.ConfirmarPaso(ctx, u.ID, in.CodigoDosPasos); err != nil {
			return err
		}
	}
	var anterior string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if err := m.validarOTP(ctx, tx, cel, "cambio_celular", in.Codigo); err != nil {
			if e, ok := err.(*httpx.Error); ok && e.Mensaje == "El código no es correcto." {
				tx.Commit()
			}
			return err
		}
		var err error
		anterior, err = cuentas.Aplicar(ctx, tx, m.app, cuentas.Cambio{
			UsuarioID: u.ID, Nuevo: cel, ConservarSesion: in.RefreshToken, Actor: u.ID, Origen: "directo",
		})
		if err != nil {
			return err
		}
		// Aviso al número anterior por si no fue la persona.
		return cuentas.EncolarSMS(ctx, tx, anterior, "VendiGo: el número de tu cuenta se cambió a "+cuentas.Ocultar(cel)+". Si no fuiste tú, escríbenos a ayuda@vendigo.pe.", "")
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Listo, tu cuenta ahora usa el número " + cel + ". Cerramos tu sesión en los demás equipos.", "celular": cel})
	return nil
}

// ---------- perdí mi número: solicitud con DNI y selfie ----------

const mensajeSolicitud = "Recibimos tu solicitud. Si los datos coinciden con tu cuenta verificada, el equipo de VendiGo la revisará y te avisaremos por SMS al número nuevo."

// codigoRecuperarCuenta envía un código al número nuevo (sin sesión).
func (m *Modulo) codigoRecuperarCuenta(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		CelularNuevo string `json:"celular_nuevo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	cel, err := m.celularNuevo(r, in.CelularNuevo, "")
	if err != nil {
		return err
	}
	return m.enviarOTP(w, r, cel, "cambio_celular")
}

// archivoRecuperarCuenta da una URL firmada para subir la foto del DNI o la selfie al bucket privado.
func (m *Modulo) archivoRecuperarCuenta(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Tipo        string `json:"tipo"`
		ContentType string `json:"content_type"`
		Tamano      int64  `json:"tamano"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if in.Tipo != "frente" && in.Tipo != "selfie" {
		return httpx.Invalido("Tipo de archivo no válido.")
	}
	if !strings.HasPrefix(in.ContentType, "image/") || in.Tamano <= 0 || in.Tamano > 8<<20 {
		return httpx.Invalido("Sube una imagen de hasta 8 MB.")
	}
	key := cuentas.PrefijoArchivos + uuid.NewString() + "/" + in.Tipo
	u, err := m.app.Archivos.URLSubida(r.Context(), false, key, in.ContentType, in.Tamano)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"key": key, "url_subida": u})
	return nil
}

// solicitarRecuperarCuenta registra la solicitud. La respuesta es la misma aunque los datos no coincidan.
func (m *Modulo) solicitarRecuperarCuenta(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		CelularAnterior string `json:"celular_anterior"`
		CelularNuevo    string `json:"celular_nuevo"`
		Codigo          string `json:"codigo"`
		Documento       string `json:"documento"`
		FrenteKey       string `json:"frente_key"`
		SelfieKey       string `json:"selfie_key"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	anterior := limpiarCelular(in.CelularAnterior)
	nuevo := limpiarCelular(in.CelularNuevo)
	if !reCelular.MatchString(anterior) || !reCelular.MatchString(nuevo) {
		return httpx.Invalido("Escribe los dos números de 9 dígitos.")
	}
	if anterior == nuevo {
		return httpx.Invalido("El número nuevo debe ser distinto al anterior.")
	}
	in.Documento = strings.TrimSpace(in.Documento)
	if len(in.Documento) < 8 || len(in.Documento) > 12 {
		return httpx.Invalido("Escribe el número de tu documento.")
	}
	ctx := r.Context()
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if err := m.validarOTP(ctx, tx, nuevo, "cambio_celular", in.Codigo); err != nil {
			if e, ok := err.(*httpx.Error); ok && e.Mensaje == "El código no es correcto." {
				tx.Commit()
			}
			return err
		}
		_, err := cuentas.Crear(ctx, tx, m.app, cuentas.Solicitud{
			CelularAnterior: anterior, CelularNuevo: nuevo, Documento: in.Documento,
			FrenteKey: in.FrenteKey, SelfieKey: in.SelfieKey, IP: httpx.IP(r),
		})
		return err
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": mensajeSolicitud})
	return nil
}
