// Package mercadopago: integración OPCIONAL por tienda con Mercado Pago (Split de Pagos 1:1).
//
//   - La tienda vincula SU cuenta con OAuth (authorization code). Los tokens se guardan cifrados.
//   - El comprador paga en el checkout de Mercado Pago; el dinero va directo a la cuenta de la tienda.
//     VendiGo no cobra comisión (marketplace_fee = 0) y nunca recibe el dinero.
//   - El pago se confirma SOLO cuando VendiGo lo consulta en la API de Mercado Pago con el token de la tienda
//     (el aviso del webhook nunca basta por sí solo); además se valida la firma x-signature si hay clave.
//
// Referencias: documentación oficial de Mercado Pago Developers (OAuth "Obtener Access Token", Checkout Pro
// "preferencias" y "Notificaciones Webhooks").
package mercadopago

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

type Modulo struct {
	app  *core.App
	http *http.Client
}

func Nuevo(app *core.App) *Modulo {
	return &Modulo{app: app, http: &http.Client{Timeout: 15 * time.Second}}
}

func (m *Modulo) RutasVendedor(r chi.Router) {
	r.Method("GET", "/mercadopago", httpx.Handler(m.estado))
	r.Method("POST", "/mercadopago/vincular", httpx.Handler(m.vincular))
	r.Method("DELETE", "/mercadopago", httpx.Handler(m.desvincular))
}

// RutasPublicas: el aviso (webhook) de Mercado Pago y el inicio del pago desde el seguimiento del comprador.
func (m *Modulo) RutasPublicas(r chi.Router) {
	r.Method("POST", "/mercadopago/webhook", httpx.Handler(m.webhook))
	r.Method("POST", "/seguimiento/{token}/mercadopago", httpx.Handler(m.pagar))
	r.Method("POST", "/seguimiento/{token}/mercadopago/verificar", httpx.Handler(m.verificar))
}

func (m *Modulo) redirectURI() string { return m.app.Cfg.WebURL + "/vendedor/mercadopago" }

// ---------- vinculación (OAuth) ----------

func (m *Modulo) estado(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	resp := map[string]any{"disponible": m.app.Cfg.MercadoPagoListo(), "vinculada": false}
	var desde time.Time
	if err := m.app.DB.QueryRowContext(ctx, `SELECT vinculado_en FROM tiendas_mercadopago WHERE tienda_id=$1`, tid).Scan(&desde); err == nil {
		resp["vinculada"], resp["vinculada_en"] = true, desde
	}
	if m.app.Cfg.MercadoPagoListo() {
		// "state" único por intento: une el código que vuelve con esta tienda (15 min de validez).
		estado := aleatorio()
		if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO mercadopago_estados (estado, tienda_id) VALUES ($1,$2)`, estado, tid); err != nil {
			return err
		}
		q := url.Values{"client_id": {m.app.Cfg.MPClientID}, "response_type": {"code"}, "platform_id": {"mp"},
			"state": {estado}, "redirect_uri": {m.redirectURI()}}
		resp["url_autorizacion"] = m.app.Cfg.MPAuthURL + "?" + q.Encode()
	}
	httpx.OK(w, resp)
	return nil
}

type tokenResp struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
	UserID       int64  `json:"user_id"`
}

func (m *Modulo) pedirToken(ctx context.Context, cuerpo map[string]string) (*tokenResp, error) {
	cuerpo["client_id"], cuerpo["client_secret"] = m.app.Cfg.MPClientID, m.app.Cfg.MPClientSecret
	var t tokenResp
	if err := m.llamar(ctx, "POST", "/oauth/token", "", cuerpo, &t); err != nil {
		return nil, err
	}
	if t.AccessToken == "" || t.RefreshToken == "" {
		return nil, errors.New("mercado pago no devolvió los tokens")
	}
	return &t, nil
}

func (m *Modulo) guardarTokens(ctx context.Context, q core.Ejecutor, tid string, t *tokenResp) error {
	acc, err := m.app.Cifrador.Cifrar(t.AccessToken)
	if err != nil {
		return err
	}
	ref, err := m.app.Cifrador.Cifrar(t.RefreshToken)
	if err != nil {
		return err
	}
	vence := time.Now().Add(time.Duration(t.ExpiresIn) * time.Second)
	_, err = q.ExecContext(ctx, `INSERT INTO tiendas_mercadopago (tienda_id, mp_usuario_id, access_cifrado, refresh_cifrado, vence_en)
		VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tienda_id) DO UPDATE SET mp_usuario_id=$2, access_cifrado=$3, refresh_cifrado=$4, vence_en=$5`,
		tid, fmt.Sprint(t.UserID), acc, ref, vence)
	return err
}

// vincular: la página /vendedor/mercadopago recibe ?code&state de Mercado Pago y los envía aquí (con la sesión).
func (m *Modulo) vincular(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	if !m.app.Cfg.MercadoPagoListo() {
		return httpx.Conflicto("mp_no_disponible", "Mercado Pago todavía no está disponible en VendiGo.")
	}
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Code  string `json:"code"`
		State string `json:"state"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	res, err := m.app.DB.ExecContext(ctx, `DELETE FROM mercadopago_estados WHERE estado=$1 AND tienda_id=$2 AND creado_en > now() - interval '15 minutes'`, in.State, tid)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n != 1 || in.Code == "" {
		return httpx.Invalido("La autorización venció o no corresponde a tu tienda. Vuelve a tocar “Vincular Mercado Pago”.")
	}
	t, err := m.pedirToken(ctx, map[string]string{"grant_type": "authorization_code", "code": in.Code, "redirect_uri": m.redirectURI()})
	if err != nil {
		slog.Error("mercadopago oauth", "err", err)
		return httpx.Conflicto("mp_oauth", "Mercado Pago no aceptó la autorización. Inténtalo otra vez.")
	}
	if err := m.guardarTokens(ctx, m.app.DB, tid, t); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(ctx)
	m.app.Auditar(ctx, m.app.DB, u.ID, "vincular_mercadopago", "tienda", tid, nil)
	httpx.OK(w, map[string]string{"mensaje": "Listo: tu cuenta de Mercado Pago quedó vinculada."})
	return nil
}

func (m *Modulo) desvincular(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	if _, err := m.app.DB.ExecContext(ctx, `DELETE FROM tiendas_mercadopago WHERE tienda_id=$1`, tid); err != nil {
		return err
	}
	u, _ := httpx.UsuarioDe(ctx)
	m.app.Auditar(ctx, m.app.DB, u.ID, "desvincular_mercadopago", "tienda", tid, nil)
	httpx.OK(w, map[string]string{"mensaje": "Desvinculaste Mercado Pago. Tus clientes siguen pagando por Yape, Plin o transferencia."})
	return nil
}

// tokenTienda devuelve el access token de la tienda y lo renueva si está por vencer (refresh_token).
func (m *Modulo) tokenTienda(ctx context.Context, tid string) (string, error) {
	var acc, ref string
	var vence time.Time
	if err := m.app.DB.QueryRowContext(ctx, `SELECT access_cifrado, refresh_cifrado, vence_en FROM tiendas_mercadopago WHERE tienda_id=$1`, tid).
		Scan(&acc, &ref, &vence); err != nil {
		return "", err
	}
	if time.Until(vence) > 24*time.Hour {
		return m.app.Cifrador.Descifrar(acc)
	}
	refresh, err := m.app.Cifrador.Descifrar(ref)
	if err != nil {
		return "", err
	}
	t, err := m.pedirToken(ctx, map[string]string{"grant_type": "refresh_token", "refresh_token": refresh})
	if err != nil {
		return "", err
	}
	if err := m.guardarTokens(ctx, m.app.DB, tid, t); err != nil {
		return "", err
	}
	return t.AccessToken, nil
}

// ---------- pago del comprador ----------

// pagar crea la preferencia de Checkout Pro en la cuenta de la tienda y devuelve el enlace para pagar.
func (m *Modulo) pagar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	pid, tid, codigo, err := pedidos.IDPorToken(ctx, m.app.DB, chi.URLParam(r, "token"))
	if err != nil {
		return err
	}
	var metodo, estadoPedido, estadoPago string
	var monto int
	var vence *time.Time
	if err := m.app.DB.QueryRowContext(ctx, `SELECT p.metodo_pago, p.estado, g.estado, g.monto_centimos, p.pago_vence_en
		FROM pedidos p JOIN pagos g ON g.pedido_id=p.id WHERE p.id::text=$1`, pid).Scan(&metodo, &estadoPedido, &estadoPago, &monto, &vence); err != nil {
		return err
	}
	if metodo != "mercadopago" {
		return httpx.Conflicto("metodo", "Este pedido no se paga con Mercado Pago.")
	}
	if estadoPedido == "cancelado" || estadoPedido == "rechazado" || estadoPago != "pendiente" {
		return httpx.Conflicto("pago_cerrado", "Este pedido ya no está esperando un pago.")
	}
	token, err := m.tokenTienda(ctx, tid)
	if err != nil {
		return httpx.Conflicto("mp_no_vinculado", "La tienda ya no tiene Mercado Pago disponible. Elige otro medio con la tienda.")
	}
	var seguimiento string
	m.app.DB.QueryRowContext(ctx, `SELECT token_seguimiento FROM pedidos WHERE id::text=$1`, pid).Scan(&seguimiento)
	volver := m.app.Cfg.WebURL + "/seguimiento/" + seguimiento
	pref := map[string]any{
		"items": []map[string]any{{"title": "Pedido " + codigo, "quantity": 1, "unit_price": float64(monto) / 100, "currency_id": "PEN"}},
		// external_reference = pedido: el webhook lo compara con el pago consultado en la API.
		"external_reference":   pid,
		"notification_url":     m.app.Cfg.WebURL + "/api/v1/mercadopago/webhook?pedido=" + url.QueryEscape(pid),
		"back_urls":            map[string]string{"success": volver, "pending": volver, "failure": volver},
		"auto_return":          "approved",
		"marketplace_fee":      0, // VendiGo no cobra comisión por venta
		"statement_descriptor": "VENDIGO",
	}
	if vence != nil {
		pref["expires"] = true
		pref["expiration_date_to"] = vence.Format("2006-01-02T15:04:05.000-07:00")
	}
	var res struct {
		InitPoint        string `json:"init_point"`
		SandboxInitPoint string `json:"sandbox_init_point"`
	}
	if err := m.llamar(ctx, "POST", "/checkout/preferences", token, pref, &res); err != nil {
		slog.Error("mercadopago preferencia", "pedido", pid, "err", err)
		return httpx.Conflicto("mp_error", "Mercado Pago no respondió. Inténtalo en unos segundos.")
	}
	enlace := res.InitPoint
	if m.app.Cfg.MPPrueba && res.SandboxInitPoint != "" {
		enlace = res.SandboxInitPoint
	}
	httpx.OK(w, map[string]string{"url": enlace})
	return nil
}

// verificar: al volver de Mercado Pago, la página de seguimiento trae ?payment_id=… y pide revisarlo. Es lo mismo
// que hace el webhook (consulta el pago en la API): sirve si el aviso tarda o no llega (por ejemplo, en local).
func (m *Modulo) verificar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	pid, _, _, err := pedidos.IDPorToken(ctx, m.app.DB, chi.URLParam(r, "token"))
	if err != nil {
		return err
	}
	var in struct {
		PagoID string `json:"payment_id"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if in.PagoID == "" || len(in.PagoID) > 40 {
		return httpx.Invalido("Falta el pago de Mercado Pago.")
	}
	if err := m.Procesar(ctx, pid, in.PagoID); err != nil {
		slog.Error("mercadopago verificar", "pedido", pid, "err", err)
		return httpx.Conflicto("mp_error", "No pudimos consultar tu pago en Mercado Pago. Se confirmará solo en unos minutos.")
	}
	httpx.OK(w, map[string]string{"mensaje": "Revisamos tu pago en Mercado Pago."})
	return nil
}

// ---------- aviso (webhook) ----------

// FirmaValida verifica x-signature (ts=…,v1=…) con el manifest "id:[data.id];request-id:[x-request-id];ts:[ts];"
// y HMAC-SHA256 con la clave secreta de Webhooks. Si falta un valor, ese par se omite del manifest.
func FirmaValida(secreto, xSignature, xRequestID, dataID string) bool {
	var ts, v1 string
	for _, parte := range strings.Split(xSignature, ",") {
		k, v, _ := strings.Cut(strings.TrimSpace(parte), "=")
		switch k {
		case "ts":
			ts = v
		case "v1":
			v1 = v
		}
	}
	if ts == "" || v1 == "" {
		return false
	}
	manifest := ""
	if dataID != "" {
		manifest += "id:" + strings.ToLower(dataID) + ";"
	}
	if xRequestID != "" {
		manifest += "request-id:" + xRequestID + ";"
	}
	manifest += "ts:" + ts + ";"
	mac := hmac.New(sha256.New, []byte(secreto))
	mac.Write([]byte(manifest))
	return hmac.Equal([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(strings.ToLower(v1)))
}

type pagoMP struct {
	Status            string  `json:"status"`
	ExternalReference string  `json:"external_reference"`
	TransactionAmount float64 `json:"transaction_amount"`
	CurrencyID        string  `json:"currency_id"`
}

func (m *Modulo) webhook(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	q := r.URL.Query()
	cuerpo, _ := io.ReadAll(io.LimitReader(r.Body, 64<<10))
	var aviso struct {
		Type string `json:"type"`
		Data struct {
			ID json.RawMessage `json:"id"`
		} `json:"data"`
	}
	json.Unmarshal(cuerpo, &aviso)
	dataID := q.Get("data.id")
	if dataID == "" {
		dataID = strings.Trim(string(aviso.Data.ID), `"`)
	}
	// La firma se valida si viene. Aun sin firma, nada se confirma sin consultar el pago en la API de Mercado Pago.
	if firma := r.Header.Get("x-signature"); m.app.Cfg.MPWebhookSecret != "" && firma != "" && !FirmaValida(m.app.Cfg.MPWebhookSecret, firma, r.Header.Get("x-request-id"), q.Get("data.id")) {
		return httpx.NuevoError(http.StatusUnauthorized, "firma_invalida", "Firma inválida.")
	}
	tipo := q.Get("type")
	if tipo == "" {
		tipo = aviso.Type
	}
	if tipo != "payment" || dataID == "" || q.Get("pedido") == "" {
		w.WriteHeader(http.StatusOK) // otros avisos no nos interesan; se responde 200 para que no se reintenten
		return nil
	}
	if err := m.Procesar(ctx, q.Get("pedido"), dataID); err != nil {
		slog.Error("mercadopago webhook", "pedido", q.Get("pedido"), "pago", dataID, "err", err)
		return err // Mercado Pago reintenta si no respondemos 2xx
	}
	w.WriteHeader(http.StatusOK)
	return nil
}

// Procesar consulta el pago en la API de Mercado Pago (con el token de la tienda dueña del pedido) y, si está
// aprobado, por el monto y la moneda correctos y para ESTE pedido, lo deja confirmado. Es idempotente.
func (m *Modulo) Procesar(ctx context.Context, pid, pagoID string) error {
	var tid string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT tienda_id FROM pedidos WHERE id::text=$1 AND metodo_pago='mercadopago'`, pid).Scan(&tid); err != nil {
		if core.SinFilas(err) {
			return nil
		}
		return err
	}
	token, err := m.tokenTienda(ctx, tid)
	if err != nil {
		return err
	}
	var p pagoMP
	if err := m.llamar(ctx, "GET", "/v1/payments/"+url.PathEscape(pagoID), token, nil, &p); err != nil {
		return err
	}
	if p.ExternalReference != pid || p.CurrencyID != "PEN" {
		slog.Warn("mercadopago: pago que no corresponde al pedido", "pedido", pid, "pago", pagoID)
		return nil
	}
	return m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var estado, codigo, estadoPedido string
		var monto int
		if err := tx.QueryRowContext(ctx, `SELECT g.estado, g.monto_centimos, p.codigo, p.estado FROM pagos g JOIN pedidos p ON p.id=g.pedido_id
			WHERE g.pedido_id::text=$1 FOR UPDATE OF g`, pid).Scan(&estado, &monto, &codigo, &estadoPedido); err != nil {
			return err
		}
		switch {
		case p.Status == "approved" && estado == "pendiente":
			if int(p.TransactionAmount*100+0.5) < monto {
				slog.Warn("mercadopago: monto menor al del pedido", "pedido", pid, "pago", pagoID)
				return nil
			}
			if estadoPedido == "cancelado" || estadoPedido == "rechazado" {
				// Pagó justo cuando el pedido se cerró (por ejemplo, venció): la tienda debe devolverlo.
				if err := pagos.CambiarPorProveedor(ctx, tx, pid, pagos.Cambio{Estado: "confirmado", Detalle: "Mercado Pago aprobó el pago después de cerrarse el pedido.", Referencia: pagoID}); err != nil {
					return err
				}
				_, err := pagos.AbrirDevolucion(ctx, tx, pid, "cancelacion")
				return err
			}
			if err := pagos.CambiarPorProveedor(ctx, tx, pid, pagos.Cambio{Estado: "confirmado", Detalle: "Mercado Pago confirmó el pago.", Referencia: pagoID}); err != nil {
				return err
			}
			billetera.Notificar(ctx, tx, tid, "Pago confirmado: "+codigo, "Mercado Pago confirmó el pago. Ya puedes preparar el pedido.", "/vendedor/pedidos/"+pid)
			billetera.SMSComprador(ctx, tx, pid, "Mercado Pago confirmó tu pago del pedido "+codigo+".")
		case (p.Status == "refunded" || p.Status == "charged_back") && estado == "confirmado":
			return pagos.CambiarPorProveedor(ctx, tx, pid, pagos.Cambio{Estado: "reembolsado", Detalle: "Mercado Pago informó la devolución del pago.", Referencia: pagoID})
		}
		return nil // pendiente, rechazado u otro: el pago sigue como estaba y el comprador puede intentar de nuevo
	})
}

// ---------- utilidades ----------

func (m *Modulo) llamar(ctx context.Context, metodo, ruta, token string, cuerpo, destino any) error {
	var lector io.Reader
	if cuerpo != nil {
		b, err := json.Marshal(cuerpo)
		if err != nil {
			return err
		}
		lector = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, metodo, m.app.Cfg.MPAPIURL+ruta, lector)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := m.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return fmt.Errorf("mercado pago %s %s: %d", metodo, ruta, res.StatusCode)
	}
	return json.Unmarshal(b, destino)
}

func aleatorio() string {
	b := make([]byte, 24)
	rand.Read(b)
	return hex.EncodeToString(b)
}
