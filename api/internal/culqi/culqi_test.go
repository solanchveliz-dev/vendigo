package culqi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func servidor(t *testing.T, codigo int, respuesta string, revisar func(*http.Request, map[string]any)) {
	t.Helper()
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var cuerpo map[string]any
		json.NewDecoder(r.Body).Decode(&cuerpo)
		if revisar != nil {
			revisar(r, cuerpo)
		}
		w.WriteHeader(codigo)
		w.Write([]byte(respuesta))
	}))
	t.Cleanup(s.Close)
	antes := urlCargos
	urlCargos = s.URL
	t.Cleanup(func() { urlCargos = antes })
}

func TestCobroAprobado(t *testing.T) {
	servidor(t, 201, `{"object":"charge","id":"chr_test_123","outcome":{"type":"venta_exitosa"}}`, func(r *http.Request, c map[string]any) {
		if r.Header.Get("Authorization") != "Bearer sk_test_x" {
			t.Errorf("falta la llave secreta en la cabecera")
		}
		if c["amount"].(float64) != 990 || c["currency_code"] != "PEN" || c["source_id"] != "tkn_test_1" {
			t.Errorf("cuerpo inesperado: %v", c)
		}
	})
	id, err := Cobrar(context.Background(), "sk_test_x", Cargo{Monto: 990, Email: "a@b.pe", Token: "tkn_test_1", Descripcion: "Plan"})
	if err != nil || id != "chr_test_123" {
		t.Fatalf("id=%q err=%v", id, err)
	}
}

func TestCobroRechazado(t *testing.T) {
	servidor(t, 402, `{"object":"error","type":"card_error","user_message":"Tu tarjeta no tiene fondos suficientes."}`, nil)
	_, err := Cobrar(context.Background(), "sk_test_x", Cargo{Monto: 990, Email: "a@b.pe", Token: "tkn_test_1"})
	var r ErrRechazado
	if !errors.As(err, &r) || r.Mensaje != "Tu tarjeta no tiene fondos suficientes." {
		t.Fatalf("esperaba rechazo con mensaje, obtuve %v", err)
	}
}

func TestSinLlave(t *testing.T) {
	if _, err := Cobrar(context.Background(), "", Cargo{}); err == nil {
		t.Fatal("sin llave secreta debe fallar")
	}
}
