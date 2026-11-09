package billetera

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// ComisionPasarela calcula lo que cobra Culqi por un pago (referencial: 3.44 % + S/ 0.69, mínimo S/ 3.50).
func ComisionPasarela(totalCentimos int) int {
	if totalCentimos < 8772 {
		return 350
	}
	return (totalCentimos*344+5000)/10000 + 69
}

type Saldos struct {
	ALiberar   int `json:"a_liberar_centimos"`
	Disponible int `json:"disponible_centimos"`
	Retirado   int `json:"retirado_centimos"`
}

func LeerSaldos(ctx context.Context, q core.Ejecutor, tiendaID string) (Saldos, error) {
	var s Saldos
	err := q.QueryRowContext(ctx, `SELECT
		COALESCE(SUM(monto_centimos) FILTER (WHERE bolsa='a_liberar'), 0),
		COALESCE(SUM(monto_centimos) FILTER (WHERE bolsa='disponible'), 0),
		COALESCE(SUM(monto_centimos) FILTER (WHERE bolsa='retirado'), 0)
		FROM movimientos WHERE tienda_id=$1`, tiendaID).Scan(&s.ALiberar, &s.Disponible, &s.Retirado)
	return s, err
}

func mover(ctx context.Context, tx *sql.Tx, tiendaID string, pedidoID, retiroID any, tipo, bolsa string, monto int, detalle string) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO movimientos (tienda_id, pedido_id, retiro_id, tipo, bolsa, monto_centimos, detalle)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`, tiendaID, pedidoID, retiroID, tipo, bolsa, monto, detalle)
	return err
}

// RegistrarCobro: el pago del comprador entra "a liberar" y se descuenta la comisión de la pasarela.
func RegistrarCobro(ctx context.Context, tx *sql.Tx, tiendaID, pedidoID, codigo string, total int) (int, error) {
	com := ComisionPasarela(total)
	if err := mover(ctx, tx, tiendaID, pedidoID, nil, "cobro", "a_liberar", total, "Pago del pedido "+codigo); err != nil {
		return 0, err
	}
	if err := mover(ctx, tx, tiendaID, pedidoID, nil, "comision_pasarela", "a_liberar", -com, "Costo de la pasarela (Culqi)"); err != nil {
		return 0, err
	}
	_, err := tx.ExecContext(ctx, `UPDATE pedidos SET comision_pasarela_centimos=$2 WHERE id=$1`, pedidoID, com)
	return com, err
}

// RegistrarDevolucion revierte el cobro de un pedido que todavía no se liberó.
func RegistrarDevolucion(ctx context.Context, tx *sql.Tx, tiendaID, pedidoID, codigo string) error {
	var neto int
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(monto_centimos),0) FROM movimientos
		WHERE pedido_id=$1 AND bolsa='a_liberar'`, pedidoID).Scan(&neto); err != nil {
		return err
	}
	if neto == 0 {
		return nil
	}
	if err := mover(ctx, tx, tiendaID, pedidoID, nil, "devolucion", "a_liberar", -neto, "Devolución del pedido "+codigo); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `UPDATE pedidos SET pago_estado='devuelto' WHERE id=$1 AND pago_estado='pagado'`, pedidoID)
	return err
}

// FechaLiberacion: la entrega más los días de la reputación de la tienda, pero nunca antes
// de que la pasarela le abone la venta a VendiGo.
func FechaLiberacion(entregado, venta time.Time, reputacion string) time.Time {
	f := entregado.AddDate(0, 0, tiendas.DiasLiberacion(reputacion))
	if a := AbonoPasarela(venta); a.After(f) {
		return a
	}
	return f
}

// liberar pasa el neto de un pedido de "a liberar" a "disponible".
func liberar(ctx context.Context, tx *sql.Tx, tiendaID, pedidoID, codigo string) error {
	var neto int
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(monto_centimos),0) FROM movimientos
		WHERE pedido_id=$1 AND bolsa='a_liberar'`, pedidoID).Scan(&neto); err != nil {
		return err
	}
	if neto > 0 {
		if err := mover(ctx, tx, tiendaID, pedidoID, nil, "liberacion", "a_liberar", -neto, "Liberado: pedido "+codigo); err != nil {
			return err
		}
		if err := mover(ctx, tx, tiendaID, pedidoID, nil, "liberacion", "disponible", neto, "Liberado: pedido "+codigo); err != nil {
			return err
		}
	}
	_, err := tx.ExecContext(ctx, `UPDATE pedidos SET liberado=true, cerrado_en=now() WHERE id=$1`, pedidoID)
	return err
}

// Notificar crea un aviso dentro de la plataforma para el dueño de la tienda.
// El tipo (para los filtros) sale de a dónde lleva el aviso.
func Notificar(ctx context.Context, q core.Ejecutor, tiendaID, titulo, cuerpo, enlace string) {
	tipo := "pedidos"
	switch {
	case strings.HasPrefix(enlace, "/vendedor/cobros"), strings.HasPrefix(enlace, "/vendedor/plan"):
		tipo = "pagos"
	case strings.HasPrefix(enlace, "/vendedor/consultas"):
		tipo = "consultas"
	case strings.HasPrefix(enlace, "/vendedor/productos"):
		tipo = "inventario"
	}
	// La tienda puede apagar los avisos de pedidos, consultas o inventario; los de pagos y reclamos siempre llegan.
	if _, err := q.ExecContext(ctx, `INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo)
		SELECT usuario_id, $2, $3, $4, $5 FROM tiendas WHERE id=$1 AND ($5 = 'pagos' OR COALESCE((avisos->>$5)::boolean, true))`,
		tiendaID, titulo, cuerpo, enlace, tipo); err != nil {
		slog.Error("notificación", "err", err)
	}
}

// Barrer ejecuta las tareas programadas (en AWS lo dispara EventBridge; en local, el worker):
//  1. Da por recibidos los envíos por agencia que no se confirmaron ni reclamaron en 7 días.
//  2. Libera el dinero de los pedidos entregados cuyo plazo ya venció y no tienen reclamo activo.
func Barrer(ctx context.Context, app *core.App) (confirmados, liberados int, err error) {
	rows, err := app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, p.tienda_id, t.reputacion FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id
		WHERE p.estado='enviado' AND p.entrega='agencia' AND p.enviado_en < now() - interval '7 days'
		AND NOT EXISTS (SELECT 1 FROM reclamos r WHERE r.pedido_id=p.id)`)
	if err != nil {
		return 0, 0, err
	}
	type fila struct{ id, codigo, tienda, rep string }
	var auto []fila
	for rows.Next() {
		var f fila
		rows.Scan(&f.id, &f.codigo, &f.tienda, &f.rep)
		auto = append(auto, f)
	}
	rows.Close()
	for _, f := range auto {
		err := app.EnTransaccion(ctx, func(tx *sql.Tx) error {
			return MarcarEntregado(ctx, tx, f.tienda, f.id, f.codigo, f.rep, "automatico")
		})
		if err == nil {
			confirmados++
		}
	}

	rows, err = app.DB.QueryContext(ctx, `SELECT p.id, p.codigo, p.tienda_id FROM pedidos p
		WHERE p.estado='entregado' AND NOT p.liberado AND p.liberar_en <= now()
		AND NOT EXISTS (SELECT 1 FROM reclamos r WHERE r.pedido_id=p.id AND r.estado IN ('abierto','en_revision'))`)
	if err != nil {
		return confirmados, 0, err
	}
	var listos []fila
	for rows.Next() {
		var f fila
		rows.Scan(&f.id, &f.codigo, &f.tienda)
		listos = append(listos, f)
	}
	rows.Close()
	for _, f := range listos {
		err := app.EnTransaccion(ctx, func(tx *sql.Tx) error {
			if err := liberar(ctx, tx, f.tienda, f.id, f.codigo); err != nil {
				return err
			}
			Notificar(ctx, tx, f.tienda, "Dinero disponible", fmt.Sprintf("El pago del pedido %s ya está disponible para retirar.", f.codigo), "/vendedor/cobros")
			return nil
		})
		if err != nil {
			slog.Error("liberación", "pedido", f.codigo, "err", err)
			continue
		}
		liberados++
	}
	return confirmados, liberados, nil
}

// MarcarEntregado cierra la entrega y programa la liberación del dinero.
func MarcarEntregado(ctx context.Context, tx *sql.Tx, tiendaID, pedidoID, codigo, reputacion, por string) error {
	ahora := time.Now()
	var venta time.Time
	if err := tx.QueryRowContext(ctx, `SELECT creado_en FROM pedidos WHERE id=$1`, pedidoID).Scan(&venta); err != nil {
		return err
	}
	lib := FechaLiberacion(ahora, venta, reputacion)
	if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET estado='entregado', entregado_en=$2, liberar_en=$3, confirmado_por=$4 WHERE id=$1`,
		pedidoID, ahora, lib, por); err != nil {
		return err
	}
	detalle := map[string]string{"comprador": "El comprador confirmó que lo recibió", "automatico": "Se dio por recibido (pasó el plazo sin reclamos)", "vendedor": "Entregado en tienda"}[por]
	if _, err := tx.ExecContext(ctx, `INSERT INTO pedido_eventos (pedido_id, estado, detalle) VALUES ($1,'entregado',$2)`, pedidoID, detalle); err != nil {
		return err
	}
	if !lib.After(ahora) {
		return liberar(ctx, tx, tiendaID, pedidoID, codigo)
	}
	return nil
}
