package pruebas

import (
	"database/sql"
	"testing"
)

// Registrar un envío por agencia guarda la guía, la clave y el enlace de rastreo sin gastar créditos de IA.
// El historial de usos anteriores de "leer_boleta" se conserva (no se borra ni rompe la tabla).
func TestEnvioManualSinIA(t *testing.T) {
	necesitaBase(t)
	tid := crearTienda(t)
	pid := crearPedido(t, tid, "preparando", "informado_tienda", 0)

	enTransaccion(t, func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO envios (pedido_id, agencia, numero_orden, clave_recojo, enlace_rastreo)
			VALUES ($1, 'Transportes Línea', '00482913', '4821', 'https://rastreo.ejemplo.pe/00482913')`, pid)
		return err
	})
	if got := texto(t, `SELECT enlace_rastreo FROM envios WHERE pedido_id=$1`, pid); got != "https://rastreo.ejemplo.pe/00482913" {
		t.Fatalf("enlace de rastreo guardado = %q", got)
	}
	if n := numero(t, `SELECT count(*) FROM uso_ia WHERE tienda_id=$1`, tid); n != 0 {
		t.Fatalf("registrar un envío no debe gastar créditos de IA (usos: %d)", n)
	}
	// Los usos antiguos de la lectura de boletas siguen siendo válidos como historial.
	if err := intentar(t, func(tx *sql.Tx) error {
		_, err := tx.Exec(`INSERT INTO uso_ia (tienda_id, herramienta, creditos) VALUES ($1, 'leer_boleta', 2)`, tid)
		return err
	}); err != nil {
		t.Fatalf("el historial de leer_boleta debe seguir siendo válido: %v", err)
	}
}
