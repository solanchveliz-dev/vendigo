package pagos

import "testing"

func TestSoloElProveedorConfirma(t *testing.T) {
	// Ni el comprador ni la tienda pueden llevar un pago a "confirmado", "rechazado" o "reembolsado".
	for _, e := range []string{"confirmado", "rechazado", "reembolsado", "de_prueba"} {
		if _, ok := transiciones[e]; ok {
			t.Errorf("%s no debe poder marcarse sin un proveedor de pagos", e)
		}
	}
}

func TestPermiteAvanzar(t *testing.T) {
	casos := map[string]bool{"pendiente": false, "comprobante_enviado": false, "no_recibido": false,
		"informado_tienda": true, "paga_al_recibir": true, "confirmado": true, "de_prueba": true}
	for e, esperado := range casos {
		if PermiteAvanzar(e) != esperado {
			t.Errorf("%s: esperado %v", e, esperado)
		}
	}
}

func TestTransicionesDeLaTienda(t *testing.T) {
	if !transiciones["informado_tienda"]["comprobante_enviado"] || !transiciones["informado_tienda"]["paga_al_recibir"] {
		t.Error("la tienda debe poder informar el pago tras el comprobante o al recibir")
	}
	if transiciones["comprobante_enviado"]["informado_tienda"] {
		t.Error("un pago ya informado no vuelve a 'comprobante enviado'")
	}
	for e := range transiciones {
		if Textos[e] == "" {
			t.Errorf("falta el texto de %s", e)
		}
	}
}
