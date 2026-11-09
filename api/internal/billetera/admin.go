package billetera

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Acciones del administrador sobre los retiros: la transferencia al banco se hace fuera de VendiGo
// (desde la cuenta de la empresa) y aquí se registra el resultado.

// MarcarRetiroPagado registra que el dinero ya se transfirió, con su número de operación.
func MarcarRetiroPagado(ctx context.Context, tx *sql.Tx, retiroID, operacion string) (tiendaID string, err error) {
	var monto int
	err = tx.QueryRowContext(ctx, `UPDATE retiros SET estado='pagado', pagado_en=now(), operacion=$2
		WHERE id::text=$1 AND estado='en_proceso' RETURNING tienda_id, monto_centimos`, retiroID, operacion).Scan(&tiendaID, &monto)
	if core.SinFilas(err) {
		return "", httpx.Conflicto("retiro_cerrado", "Este retiro ya se procesó o no existe.")
	}
	if err != nil {
		return "", err
	}
	Notificar(ctx, tx, tiendaID, "Te transferimos tu dinero", fmt.Sprintf("Ya enviamos S/ %.2f a tu cuenta. N.° de operación: %s.", float64(monto)/100, operacion), "/vendedor/cobros/retiros/"+retiroID)
	return tiendaID, nil
}

// RechazarRetiro devuelve el monto a "disponible" (por ejemplo, si la cuenta bancaria está mal).
func RechazarRetiro(ctx context.Context, tx *sql.Tx, retiroID, motivo string) (tiendaID string, err error) {
	var monto int
	err = tx.QueryRowContext(ctx, `UPDATE retiros SET estado='rechazado', motivo_rechazo=$2
		WHERE id::text=$1 AND estado='en_proceso' RETURNING tienda_id, monto_centimos`, retiroID, motivo).Scan(&tiendaID, &monto)
	if core.SinFilas(err) {
		return "", httpx.Conflicto("retiro_cerrado", "Este retiro ya se procesó o no existe.")
	}
	if err != nil {
		return "", err
	}
	if err := mover(ctx, tx, tiendaID, nil, retiroID, "retiro", "retirado", -monto, "Retiro rechazado: "+motivo); err != nil {
		return "", err
	}
	if err := mover(ctx, tx, tiendaID, nil, retiroID, "retiro", "disponible", monto, "Retiro rechazado: "+motivo); err != nil {
		return "", err
	}
	// Los pedidos vuelven a quedar libres para el próximo retiro.
	if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET retiro_id=NULL WHERE retiro_id=$1`, retiroID); err != nil {
		return "", err
	}
	Notificar(ctx, tx, tiendaID, "No pudimos transferir tu retiro", fmt.Sprintf("Devolvimos S/ %.2f a tu saldo disponible. Motivo: %s", float64(monto)/100, motivo), "/vendedor/cobros")
	return tiendaID, nil
}
