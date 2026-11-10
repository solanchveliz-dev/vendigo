// Package culqi cobra con Culqi los pagos que las tiendas le hacen a VendiGo (planes, ventas extra, impulsos).
// El navegador tokeniza la tarjeta/Yape con la llave pública (Culqi Checkout) y aquí se crea el cargo con la secreta.
package culqi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"
)

var urlCargos = "https://api.culqi.com/v2/charges"

var cliente = &http.Client{Timeout: 30 * time.Second}

// Cargo es lo que se le cobra a la tienda.
type Cargo struct {
	Monto       int    // en céntimos
	Email       string // el que la tienda escribió en el formulario de Culqi
	Token       string // id del token que devolvió Culqi Checkout
	Descripcion string
	Metadata    map[string]string
}

// ErrRechazado: Culqi no aprobó el cobro; el mensaje es apto para mostrar a la tienda.
type ErrRechazado struct{ Mensaje string }

func (e ErrRechazado) Error() string { return e.Mensaje }

// Cobrar crea el cargo en Culqi y devuelve su id (chr_...).
func Cobrar(ctx context.Context, llaveSecreta string, c Cargo) (string, error) {
	if llaveSecreta == "" {
		return "", errors.New("culqi: falta CULQI_LLAVE_SECRETA")
	}
	desc := c.Descripcion
	if len(desc) > 80 {
		desc = desc[:80]
	}
	cuerpo, _ := json.Marshal(map[string]any{
		"amount": c.Monto, "currency_code": "PEN", "email": c.Email, "source_id": c.Token,
		"description": desc, "metadata": c.Metadata,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, urlCargos, bytes.NewReader(cuerpo))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+llaveSecreta)
	req.Header.Set("Content-Type", "application/json")
	res, err := cliente.Do(req)
	if err != nil {
		return "", fmt.Errorf("culqi: %w", err)
	}
	defer res.Body.Close()
	var r struct {
		Object      string `json:"object"`
		ID          string `json:"id"`
		UserMessage string `json:"user_message"`
		MerchantMsg string `json:"merchant_message"`
		Outcome     struct {
			Type        string `json:"type"`
			UserMessage string `json:"user_message"`
		} `json:"outcome"`
	}
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil {
		return "", fmt.Errorf("culqi: respuesta no válida (%d)", res.StatusCode)
	}
	if res.StatusCode >= 200 && res.StatusCode < 300 && r.Object == "charge" && r.ID != "" {
		return r.ID, nil
	}
	msg := r.UserMessage
	if msg == "" {
		msg = r.Outcome.UserMessage
	}
	if msg == "" {
		msg = "Culqi no pudo procesar el pago. Intenta con otro medio."
	}
	if res.StatusCode >= 500 {
		return "", fmt.Errorf("culqi %d: %s", res.StatusCode, r.MerchantMsg)
	}
	return "", ErrRechazado{Mensaje: msg}
}
