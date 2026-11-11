package admin

import (
	"context"
	"net/http"
	"regexp"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Estado de los servicios externos (para el admin y la demostración): qué está real y qué está simulado.
// No muestra llaves ni secretos: solo si cada servicio está activo.
func (m *Modulo) sistema(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var pendientes, enviados, fallidos int
	m.app.DB.QueryRowContext(ctx, `SELECT
		count(*) FILTER (WHERE enviado_en IS NULL AND error = ''),
		count(*) FILTER (WHERE enviado_en > now() - interval '24 hours'),
		count(*) FILTER (WHERE enviado_en IS NULL AND error <> '')
		FROM sms_salientes WHERE creado_en > now() - interval '24 hours'`).Scan(&pendientes, &enviados, &fallidos)
	httpx.OK(w, map[string]any{
		"entorno":     m.app.Cfg.Entorno,
		"sms":         map[string]any{"real": m.app.Cfg.OTPCanal == "sms", "pendientes_24h": pendientes, "enviados_24h": enviados, "con_error_24h": fallidos},
		"ia":          map[string]any{"real": m.app.Cfg.IAProveedor == "bedrock", "modelo": m.app.Cfg.IAModelo},
		"mercadopago": map[string]any{"configurado": m.app.Cfg.MercadoPagoListo(), "prueba": m.app.Cfg.MPPrueba},
	})
	return nil
}

var reCelularPeru = regexp.MustCompile(`^9\d{8}$`)

// smsPrueba manda un SMS de prueba DIRECTO por Amazon SNS (sin bandeja) para comprobar la configuración.
// Devuelve el error de AWS tal cual, para diagnosticar (por ejemplo, un número no verificado en el sandbox).
func (m *Modulo) smsPrueba(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Celular string `json:"celular"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if !reCelularPeru.MatchString(in.Celular) {
		return httpx.Invalido("Escribe un celular de 9 dígitos que empiece con 9.")
	}
	if m.app.Cfg.OTPCanal != "sms" {
		return httpx.Conflicto("sms_simulado", "Los SMS están en modo simulado (OTP_CANAL=log): se escriben en la consola de la API y no salen al celular.")
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err := m.app.Avisos.EnviarTexto(ctx, in.Celular, "VendiGo: SMS de prueba. Si te llegó, los avisos por SMS funcionan."); err != nil {
		return httpx.Conflicto("sms_error", "Amazon SNS no envió el SMS: "+err.Error())
	}
	m.app.Auditar(r.Context(), m.app.DB, adminID(r.Context()), "sms_prueba", "sistema", "", map[string]string{"celular": "•••••" + in.Celular[5:]})
	httpx.OK(w, map[string]string{"mensaje": "Amazon SNS aceptó el SMS. Debe llegar en unos segundos."})
	return nil
}
