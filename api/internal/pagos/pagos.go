// Package pagos registra el estado del pago de cada pedido. VendiGo NO recibe ni retiene el dinero:
// el comprador le paga directo a la tienda (Yape o Plin) y VendiGo solo guarda lo que informan
// el comprador y la tienda. "Confirmado" y "Reembolsado" quedan reservados para un proveedor de pagos real.
package pagos

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Métodos de pago directo a la tienda.
var MetodosDirectos = map[string]string{"yape_directo": "Yape a la tienda", "plin_directo": "Plin a la tienda", "efectivo": "Efectivo (pedidos antiguos)"}

// Textos de cada estado (los mismos en la web).
var Textos = map[string]string{
	"pendiente":           "Pendiente de pago",
	"comprobante_enviado": "Comprobante enviado",
	"paga_al_recibir":     "Paga al recibir",
	"adelanto_informado":  "Adelanto recibido",
	"informado_tienda":    "Pago informado por la tienda",
	"no_recibido":         "La tienda no recibió el pago",
	"confirmado":          "Pago confirmado",
	"rechazado":           "Pago rechazado",
	"reembolsado":         "Reembolsado",
	"de_prueba":           "Pedido de prueba",
}

// PermiteAvanzar indica si la tienda ya puede enviar o entregar el pedido.
func PermiteAvanzar(estado string) bool {
	switch estado {
	case "informado_tienda", "paga_al_recibir", "adelanto_informado", "confirmado", "de_prueba":
		return true
	}
	return false
}

// Registrar crea el pago de un pedido nuevo.
// adelanto es lo que se paga antes de enviar cuando momento es "adelanto" (0 en los demás casos).
func Registrar(ctx context.Context, tx *sql.Tx, pedidoID, metodo, momento string, monto, adelanto int, prueba bool) error {
	origen, estado := "tienda", "pendiente"
	if momento == "al_recibir" {
		estado = "paga_al_recibir"
	}
	if momento != "adelanto" {
		adelanto = 0
	}
	if prueba {
		origen, estado = "prueba", "de_prueba"
	}
	var id string
	if err := tx.QueryRowContext(ctx, `INSERT INTO pagos (pedido_id, origen, metodo, momento, estado, monto_centimos, adelanto_centimos)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, pedidoID, origen, metodo, momento, estado, monto, adelanto).Scan(&id); err != nil {
		return err
	}
	detalle := map[string]string{
		"pendiente":       "Pedido registrado. El comprador debe pagar directo a la tienda.",
		"paga_al_recibir": "El comprador pagará directo a la tienda al recibir el pedido.",
		"de_prueba":       "Pedido creado con datos de prueba (no hubo pago real).",
	}[estado]
	if momento == "adelanto" && !prueba {
		detalle = fmt.Sprintf("Pedido registrado. El comprador debe pagar un adelanto de S/ %.2f a la tienda y el resto al recibir.", float64(adelanto)/100)
	}
	return evento(ctx, tx, id, estado, detalle, nil)
}

func evento(ctx context.Context, q core.Ejecutor, pagoID, estado, detalle string, usuario any) error {
	_, err := q.ExecContext(ctx, `INSERT INTO pago_eventos (pago_id, estado, detalle, usuario_id) VALUES ($1,$2,$3,$4)`, pagoID, estado, detalle, usuario)
	return err
}

// Transiciones que pueden hacer el comprador y la tienda (las de proveedor van por su integración).
var transiciones = map[string]map[string]bool{
	"comprobante_enviado": {"pendiente": true, "no_recibido": true, "comprobante_enviado": true},
	"informado_tienda":    {"pendiente": true, "comprobante_enviado": true, "paga_al_recibir": true, "no_recibido": true, "adelanto_informado": true},
	"adelanto_informado":  {"pendiente": true, "comprobante_enviado": true, "no_recibido": true},
	"no_recibido":         {"pendiente": true, "comprobante_enviado": true, "paga_al_recibir": true},
}

type Cambio struct {
	Estado         string
	Detalle        string
	Usuario        any    // id de la vendedora que lo informa (nil si es el comprador)
	Referencia     string // n.° de operación de Yape/Plin
	ComprobanteKey string
}

// Cambiar mueve el pago a un nuevo estado validando que la transición tenga sentido.
func Cambiar(ctx context.Context, tx *sql.Tx, pedidoID string, c Cambio) error {
	var id, actual string
	err := tx.QueryRowContext(ctx, `SELECT id, estado FROM pagos WHERE pedido_id=$1 FOR UPDATE`, pedidoID).Scan(&id, &actual)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	desde, ok := transiciones[c.Estado]
	if !ok || !desde[actual] {
		return httpx.Conflicto("pago_estado", fmt.Sprintf("El pago está como “%s”: no se puede pasar a “%s”.", Textos[actual], Textos[c.Estado]))
	}
	var informado any
	if c.Estado == "informado_tienda" || c.Estado == "no_recibido" || c.Estado == "adelanto_informado" {
		informado = c.Usuario
	}
	if _, err := tx.ExecContext(ctx, `UPDATE pagos SET estado=$2,
		referencia=CASE WHEN $3<>'' THEN $3 ELSE referencia END,
		comprobante_key=COALESCE(NULLIF($4,''), comprobante_key),
		informado_por=COALESCE($5, informado_por), informado_en=CASE WHEN $5::uuid IS NOT NULL THEN now() ELSE informado_en END,
		actualizado_en=now() WHERE id=$1`, id, c.Estado, c.Referencia, c.ComprobanteKey, informado); err != nil {
		return err
	}
	return evento(ctx, tx, id, c.Estado, c.Detalle, c.Usuario)
}

// Estado devuelve el estado del pago de un pedido.
func Estado(ctx context.Context, q core.Ejecutor, pedidoID string) (string, error) {
	var e string
	err := q.QueryRowContext(ctx, `SELECT estado FROM pagos WHERE pedido_id=$1`, pedidoID).Scan(&e)
	return e, err
}

// AbrirDevolucion registra que la tienda debe devolver el pago (cancelación o reclamo).
// Solo aplica si el comprador pudo haber pagado; devuelve false si no hubo nada que devolver.
func AbrirDevolucion(ctx context.Context, tx *sql.Tx, pedidoID, origen string) (bool, error) {
	var estado string
	var monto, adelanto int
	if err := tx.QueryRowContext(ctx, `SELECT estado, monto_centimos, adelanto_centimos FROM pagos WHERE pedido_id=$1`, pedidoID).Scan(&estado, &monto, &adelanto); err != nil {
		return false, err
	}
	dev := ""
	switch estado {
	case "informado_tienda", "comprobante_enviado", "confirmado":
		dev = "pendiente_tienda"
		if adelanto > 0 && estado == "comprobante_enviado" {
			monto = adelanto // con adelanto, el comprobante es solo del adelanto
		}
	case "adelanto_informado":
		dev, monto = "pendiente_tienda", adelanto
	case "de_prueba":
		dev = "de_prueba"
	default:
		return false, nil // no hubo pago: no hay nada que devolver
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO devoluciones (pedido_id, origen, monto_centimos, estado) VALUES ($1,$2,$3,$4)
		ON CONFLICT (pedido_id, origen) DO NOTHING`, pedidoID, origen, monto, dev)
	return dev == "pendiente_tienda", err
}

// Proveedor es la interfaz que deberá cumplir una pasarela de pagos cuando exista autorización
// para que cada tienda use su propia cuenta. Mientras no haya una implementación registrada,
// ningún pago puede quedar como "confirmado".
type Proveedor interface {
	Nombre() string
	// CrearCobro inicia el pago en la cuenta de la tienda y devuelve la referencia del proveedor.
	CrearCobro(ctx context.Context, tiendaID, pedidoID string, monto int) (referencia string, err error)
	// VerificarAviso valida la firma de un webhook y devuelve el id del evento, la referencia y el nuevo estado.
	VerificarAviso(cuerpo []byte, firma string) (eventoID, referencia, estado string, err error)
	// Reembolsar pide la devolución al proveedor (solo si el proveedor lo permite).
	Reembolsar(ctx context.Context, referencia string, monto int) error
}
