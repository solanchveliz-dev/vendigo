package pruebas

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/mercadopago"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// La firma x-signature se valida con el manifest de la documentación de Mercado Pago:
// id:[data.id];request-id:[x-request-id];ts:[ts]; con HMAC-SHA256 y la clave secreta de Webhooks.
func TestMercadoPagoFirmaDelWebhook(t *testing.T) {
	secreto := "clave-secreta-de-prueba"
	manifest := "id:123456;request-id:abc-req;ts:1742505638683;"
	mac := hmac.New(sha256.New, []byte(secreto))
	mac.Write([]byte(manifest))
	firma := "ts=1742505638683,v1=" + hex.EncodeToString(mac.Sum(nil))
	if !mercadopago.FirmaValida(secreto, firma, "abc-req", "123456") {
		t.Fatal("una firma correcta debía aceptarse")
	}
	if mercadopago.FirmaValida(secreto, firma, "otro-req", "123456") {
		t.Error("con otro x-request-id la firma no debía aceptarse")
	}
	if mercadopago.FirmaValida("otra-clave", firma, "abc-req", "123456") {
		t.Error("con otra clave la firma no debía aceptarse")
	}
}

// Un pago se confirma SOLO si Mercado Pago, consultado con el token de la tienda, dice que está aprobado,
// es de ESTE pedido y por el monto correcto. Repetir el aviso no cambia nada.
func TestMercadoPagoConfirmaSoloConLaAPI(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()

	// Mercado Pago de mentira: responde los pagos 1 (de este pedido) y 2 (de otro pedido).
	var pedidoID string
	falso := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer token-de-la-tienda" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		ref := pedidoID
		if strings.HasSuffix(r.URL.Path, "/2") {
			ref = "00000000-0000-0000-0000-000000000000"
		}
		json.NewEncoder(w).Encode(map[string]any{"status": "approved", "external_reference": ref, "transaction_amount": 50.0, "currency_id": "PEN"})
	}))
	defer falso.Close()

	cif, err := seguridad.NuevoCifrador("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	if err != nil {
		t.Fatal(err)
	}
	antes := *app
	app.Cifrador, app.Cfg.MPAPIURL, app.Cfg.MPClientID, app.Cfg.MPClientSecret = cif, falso.URL, "app", "secreto"
	defer func() { *app = antes }()

	tid := crearTienda(t)
	acc, _ := cif.Cifrar("token-de-la-tienda")
	ref, _ := cif.Cifrar("refresh-de-la-tienda")
	if _, err := base.Exec(`INSERT INTO tiendas_mercadopago (tienda_id, mp_usuario_id, access_cifrado, refresh_cifrado, vence_en) VALUES ($1,'1',$2,$3,$4)`,
		tid, acc, ref, time.Now().Add(90*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	pedidoID = crearPedido(t, tid, "por_aceptar", "pendiente", 0) // total 5000 = S/ 50
	if _, err := base.Exec(`UPDATE pedidos SET metodo_pago='mercadopago' WHERE id=$1`, pedidoID); err != nil {
		t.Fatal(err)
	}
	if _, err := base.Exec(`UPDATE pagos SET origen='proveedor', metodo='mercadopago' WHERE pedido_id=$1`, pedidoID); err != nil {
		t.Fatal(err)
	}
	mp := mercadopago.Nuevo(app)

	// Un pago aprobado pero de OTRO pedido no confirma nada.
	if err := mp.Procesar(ctx, pedidoID, "2"); err != nil {
		t.Fatal(err)
	}
	if e := texto(t, `SELECT estado FROM pagos WHERE pedido_id=$1`, pedidoID); e != "pendiente" {
		t.Fatalf("un pago de otro pedido no debía confirmar este (estado %q)", e)
	}
	// El pago correcto lo confirma, y repetir el aviso no cambia nada.
	for i := 0; i < 2; i++ {
		if err := mp.Procesar(ctx, pedidoID, "1"); err != nil {
			t.Fatal(err)
		}
	}
	if e := texto(t, `SELECT estado FROM pagos WHERE pedido_id=$1`, pedidoID); e != "confirmado" {
		t.Fatalf("el pago aprobado por Mercado Pago debía quedar confirmado (estado %q)", e)
	}
	if n := numero(t, `SELECT count(*) FROM pago_eventos e JOIN pagos g ON g.id=e.pago_id WHERE g.pedido_id=$1 AND e.estado='confirmado'`, pedidoID); n != 1 {
		t.Errorf("el aviso repetido no debía registrar la confirmación dos veces (%d)", n)
	}
	// Un pedido confirmado por Mercado Pago ya no vence por falta de pago.
	base.Exec(`UPDATE pedidos SET pago_vence_en = now() - interval '1 minute' WHERE id=$1`, pedidoID)
	if _, err := pedidos.VencerPedidosSinPago(ctx, app); err != nil {
		t.Fatal(err)
	}
	if e := texto(t, `SELECT estado FROM pedidos WHERE id=$1`, pedidoID); e != "por_aceptar" {
		t.Errorf("un pedido ya pagado por Mercado Pago no debe vencer (estado %q)", e)
	}
}
