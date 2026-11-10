package pedidos

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
	"github.com/solanchveliz-dev/vendigo/api/internal/productos"
)

type ItemNuevo struct {
	ProductoID string `json:"producto_id"`
	VarianteID string `json:"variante_id"`
	Cantidad   int    `json:"cantidad"`
}

type PedidoNuevo struct {
	TiendaID    string
	CompradorID string
	Nombre      string
	Celular     string
	DNI         string
	Entrega     string
	Direccion   string
	Distrito    string
	Ciudad      string
	Referencia  string
	Agencia     string
	AgenciaSede string
	MetodoPago  string // yape_directo, plin_directo, tarjeta_tienda o transferencia_tienda (directo a la tienda; sin efectivo)
	MomentoPago string // antes o al_recibir
	Prueba      bool   // datos de prueba (solo modo desarrollo y seed)
	Nota        string
	Items       []ItemNuevo
}

func codigoRecojo() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(10000))
	return fmt.Sprintf("%04d", n.Int64())
}

// Crear registra un pedido, reserva el stock y crea su pago (que el comprador hace directo a la tienda).
// VendiGo no cobra ni retiene dinero. Lo usan la compra del comprador y los datos de prueba.
func Crear(ctx context.Context, app *core.App, tx *sql.Tx, in PedidoNuevo) (string, string, error) {
	if len(in.Items) == 0 {
		return "", "", httpx.Invalido("El pedido no tiene productos.")
	}
	var recojo, agencia, moto, pausada bool
	var costoMoto, adelRecojo, adelMoto int
	var yape, plin, tarjeta, transf, pagoRecojo, pagoMoto string
	var verificada, porReclamo bool
	if err := tx.QueryRowContext(ctx, `SELECT tienda_identidad_verificada(id), tienda_reclamo_bloqueante(id) IS NOT NULL FROM tiendas WHERE id=$1`, in.TiendaID).
		Scan(&verificada, &porReclamo); err != nil {
		return "", "", httpx.ErrNoEncontrado
	}
	switch {
	case !verificada && !in.Prueba: // los pedidos de prueba (simulador de desarrollo) sí se permiten
		return "", "", httpx.Conflicto("tienda_sin_verificar", "Esta tienda todavía no está verificada por VendiGo y no recibe pedidos.")
	case porReclamo:
		return "", "", httpx.Conflicto("tienda_pausada", "Esta tienda no está recibiendo pedidos por ahora.")
	}
	if err := tx.QueryRowContext(ctx, `SELECT entrega_recojo, entrega_agencia, entrega_motorizado, costo_motorizado_centimos, (pausada OR suspendida_garantia),
		yape_numero, plin_numero, recojo_pago, motorizado_pago, adelanto_pct, motorizado_adelanto_pct, tarjeta_link, transf_cuenta||transf_cci FROM tiendas WHERE id=$1 AND activa`,
		in.TiendaID).Scan(&recojo, &agencia, &moto, &costoMoto, &pausada, &yape, &plin, &pagoRecojo, &pagoMoto, &adelRecojo, &adelMoto, &tarjeta, &transf); err != nil {
		if core.SinFilas(err) {
			return "", "", httpx.ErrNoEncontrado
		}
		return "", "", err
	}
	if pausada {
		return "", "", httpx.Conflicto("tienda_pausada", "Esta tienda no está recibiendo pedidos por ahora.")
	}
	envio := 0
	switch in.Entrega {
	case "recojo":
		if !recojo {
			return "", "", httpx.Invalido("Esta tienda no tiene recojo en tienda.")
		}
	case "agencia":
		if !agencia {
			return "", "", httpx.Invalido("Esta tienda no envía por agencia.")
		}
		if strings.TrimSpace(in.DNI) == "" {
			return "", "", httpx.Invalido("La agencia pide tu DNI para entregarte el paquete.")
		}
	case "motorizado":
		if !moto {
			return "", "", httpx.Invalido("Esta tienda no tiene delivery con motorizado.")
		}
		envio = costoMoto
	default:
		return "", "", httpx.Invalido("Elige una forma de entrega.")
	}
	// Forma de pago: siempre directo a la tienda.
	switch in.MetodoPago {
	case "yape_directo":
		if yape == "" && !in.Prueba {
			return "", "", httpx.Invalido("Esta tienda no recibe Yape.")
		}
	case "plin_directo":
		if plin == "" && !in.Prueba {
			return "", "", httpx.Invalido("Esta tienda no recibe Plin.")
		}
	case "tarjeta_tienda":
		if tarjeta == "" && !in.Prueba {
			return "", "", httpx.Invalido("Esta tienda no recibe tarjeta.")
		}
	case "transferencia_tienda":
		if transf == "" && !in.Prueba {
			return "", "", httpx.Invalido("Esta tienda no recibe transferencias.")
		}
	default:
		return "", "", httpx.Invalido("Elige cómo vas a pagar.")
	}
	// Cuándo se paga lo decide la tienda por forma de entrega (el comprador no lo elige).
	// Agencia: siempre completo antes de enviar.
	pct := 0
	in.MomentoPago = "antes"
	opcion := map[string]string{"recojo": pagoRecojo, "motorizado": pagoMoto}[in.Entrega]
	switch opcion {
	case "al_recibir":
		in.MomentoPago = "al_recibir"
	case "adelanto":
		in.MomentoPago = "adelanto"
		pct = map[string]int{"recojo": adelRecojo, "motorizado": adelMoto}[in.Entrega]
		if pct <= 0 {
			in.MomentoPago = "antes"
		}
	}

	type linea struct {
		prod, vari, nombre, variante string
		img                          sql.NullString
		precio, cant                 int
	}
	var lineas []linea
	subtotal := 0
	for _, it := range in.Items {
		if it.Cantidad < 1 || it.Cantidad > 50 {
			return "", "", httpx.Invalido("La cantidad no es válida.")
		}
		var l linea
		var pct sql.NullInt64
		err := tx.QueryRowContext(ctx, `SELECT p.id, p.nombre, p.precio_centimos,
			(SELECT key FROM producto_imagenes i WHERE i.producto_id=p.id ORDER BY orden LIMIT 1),
			(SELECT descuento_pct FROM ofertas o WHERE o.producto_id=p.id AND o.termina_en > now())
			FROM productos p WHERE p.id::text=$1 AND p.tienda_id=$2 AND p.activo AND NOT p.eliminado FOR UPDATE`,
			it.ProductoID, in.TiendaID).Scan(&l.prod, &l.nombre, &l.precio, &l.img, &pct)
		if core.SinFilas(err) {
			return "", "", httpx.Invalido("Uno de los productos ya no está disponible.")
		}
		if err != nil {
			return "", "", err
		}
		if it.VarianteID != "" {
			var vprecio sql.NullInt64
			var stock int
			err := tx.QueryRowContext(ctx, `SELECT id, nombre, stock, precio_centimos FROM producto_variantes WHERE id::text=$1 AND producto_id=$2 FOR UPDATE`,
				it.VarianteID, l.prod).Scan(&l.vari, &l.variante, &stock, &vprecio)
			if err != nil {
				return "", "", httpx.Invalido("La variante elegida no existe.")
			}
			if stock < it.Cantidad {
				return "", "", httpx.Conflicto("sin_stock", fmt.Sprintf("Solo quedan %d de %s (%s).", stock, l.nombre, l.variante))
			}
			if vprecio.Valid {
				l.precio = int(vprecio.Int64)
			}
			if _, err := tx.ExecContext(ctx, `UPDATE producto_variantes SET stock=stock-$2 WHERE id=$1`, l.vari, it.Cantidad); err != nil {
				return "", "", err
			}
		}
		var stock int
		tx.QueryRowContext(ctx, `SELECT stock FROM productos WHERE id=$1`, l.prod).Scan(&stock)
		if stock < it.Cantidad {
			return "", "", httpx.Conflicto("sin_stock", fmt.Sprintf("Solo quedan %d de %s.", stock, l.nombre))
		}
		if _, err := tx.ExecContext(ctx, `UPDATE productos SET stock=stock-$2 WHERE id=$1`, l.prod, it.Cantidad); err != nil {
			return "", "", err
		}
		// Aviso de inventario cuando el stock baja de 4 o se agota.
		if quedan := stock - it.Cantidad; quedan == 0 {
			billetera.Notificar(ctx, tx, in.TiendaID, "Agotado: "+l.nombre, "Se vendió la última unidad. Repón stock para seguir vendiendo.", "/vendedor/productos/"+l.prod)
		} else if quedan <= 3 && stock > 3 {
			billetera.Notificar(ctx, tx, in.TiendaID, "Stock bajo: "+l.nombre, fmt.Sprintf("Quedan %d unidades.", quedan), "/vendedor/productos/"+l.prod)
		}
		if pct.Valid {
			l.precio = productos.PrecioConOferta(l.precio, int(pct.Int64))
		}
		l.cant = it.Cantidad
		subtotal += l.precio * l.cant
		lineas = append(lineas, l)
	}
	// El envío del motorizado se le paga a él directamente: no suma al total que cobra la tienda.
	total := subtotal
	if in.Entrega != "motorizado" {
		total += envio
	}
	adelanto := 0
	if in.MomentoPago == "adelanto" {
		adelanto = (total*pct + 99) / 100
		if adelanto <= 0 || adelanto >= total {
			in.MomentoPago, adelanto = "antes", 0
		}
	}

	var dni any
	if strings.TrimSpace(in.DNI) != "" {
		c, err := app.Cifrador.Cifrar(strings.TrimSpace(in.DNI))
		if err != nil {
			return "", "", err
		}
		dni = c
	}
	var comprador any
	if in.CompradorID != "" {
		comprador = in.CompradorID
	}
	var pid, codigo string
	// Si la tienda eligió su prefijo, el pedido sale con su propia numeración (LUNA-1001); si no, VG-….
	var propio sql.NullString
	if err := tx.QueryRowContext(ctx, `UPDATE tiendas SET contador_pedidos=contador_pedidos+1 WHERE id=$1 AND prefijo_pedido<>''
		RETURNING prefijo_pedido||'-'||contador_pedidos`, in.TiendaID).Scan(&propio); err != nil && !core.SinFilas(err) {
		return "", "", err
	}
	err := tx.QueryRowContext(ctx, `INSERT INTO pedidos (tienda_id, comprador_id, comprador_nombre, comprador_celular, comprador_dni_cifrado, entrega,
		direccion, distrito, ciudad, referencia, agencia, agencia_sede, codigo_recojo, metodo_pago, pago_estado, culqi_cargo_id,
		subtotal_centimos, envio_centimos, total_centimos, nota_comprador, codigo)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, COALESCE($21, 'VG-' || nextval('pedidos_codigo_seq'))) RETURNING id, codigo`,
		in.TiendaID, comprador, in.Nombre, in.Celular, dni, in.Entrega, in.Direccion, in.Distrito, in.Ciudad, in.Referencia,
		in.Agencia, in.AgenciaSede, codigoRecojo(), in.MetodoPago, "pendiente", nil, subtotal, envio, total, in.Nota, propio).Scan(&pid, &codigo)
	if err != nil {
		return "", "", err
	}
	for _, l := range lineas {
		var vari any
		if l.vari != "" {
			vari = l.vari
		}
		var img any
		if l.img.Valid {
			img = l.img.String
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO pedido_items (pedido_id, producto_id, variante_id, nombre, variante, imagen_key, precio_centimos, cantidad)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, pid, l.prod, vari, l.nombre, l.variante, img, l.precio, l.cant); err != nil {
			return "", "", err
		}
	}
	if err := pagos.Registrar(ctx, tx, pid, in.MetodoPago, in.MomentoPago, total, adelanto, in.Prueba); err != nil {
		return "", "", err
	}
	detalle := "Pedido recibido. Paga directo a la tienda y envía tu comprobante desde tu seguimiento."
	switch in.MomentoPago {
	case "al_recibir":
		detalle = "Pedido recibido. Pagas directo a la tienda con Yape o Plin cuando recibas tu pedido."
	case "adelanto":
		detalle = fmt.Sprintf("Pedido recibido. Paga el adelanto de S/ %.2f a la tienda y envía tu comprobante; el resto lo pagas al recibir.", float64(adelanto)/100)
	}
	if in.Prueba {
		detalle = "Pedido de prueba (no hubo pago real)."
	}
	if err := evento(ctx, tx, pid, "por_aceptar", detalle); err != nil {
		return "", "", err
	}
	billetera.Notificar(ctx, tx, in.TiendaID, "Nuevo pedido "+codigo, fmt.Sprintf("%s hizo un pedido de S/ %.2f. Acéptalo para empezar a prepararlo.", in.Nombre, float64(total)/100), "/vendedor/pedidos/"+pid)
	if !in.Prueba {
		billetera.SMSTienda(ctx, tx, in.TiendaID, fmt.Sprintf("Nuevo pedido %s de S/ %.2f. Acéptalo aquí:", codigo, float64(total)/100), "/vendedor/pedidos/"+pid)
	}
	return pid, codigo, nil
}

// ConfirmarRecibido: el comprador confirma desde su seguimiento que le llegó el pedido.
func ConfirmarRecibido(ctx context.Context, tx *sql.Tx, pid string) error {
	var estado string
	err := tx.QueryRowContext(ctx, `SELECT estado FROM pedidos WHERE id::text=$1 FOR UPDATE`, pid).Scan(&estado)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	if estado != "enviado" {
		return httpx.Conflicto("estado_invalido", "El pedido todavía no fue enviado.")
	}
	return MarcarEntregado(ctx, tx, pid, "comprador")
}

// DiasReclamo es el plazo para reclamar después de recibir el pedido.
const DiasReclamo = 7

// HorasRespuesta: la tienda tiene 48 h para responder un reclamo. Si no responde, el caso pasa a VendiGo y la
// tienda deja de recibir pedidos hasta que responda (tienda_reclamo_bloqueante). Un reclamo solo no la detiene.
const HorasRespuesta = 48

// PuedeReclamarPago: el comprador puede reclamar un pago no reconocido si la tienda dijo que no le llegó, o si
// subió su comprobante hace más de 48 h y la tienda todavía no lo revisa. Lo usan AbrirReclamo y el seguimiento.
func PuedeReclamarPago(ctx context.Context, q core.Ejecutor, pid, estadoPedido, estadoPago string) bool {
	if estadoPedido == "rechazado" || estadoPedido == "cancelado" || estadoPedido == "entregado" {
		return false
	}
	switch estadoPago {
	case "no_recibido":
		return true
	case "comprobante_enviado":
		var viejo bool
		q.QueryRowContext(ctx, `SELECT COALESCE(max(e.creado_en) < now() - make_interval(hours => $2), false)
			FROM pago_eventos e JOIN pagos g ON g.id=e.pago_id WHERE g.pedido_id::text=$1 AND e.estado='comprobante_enviado'`,
			pid, HorasRespuesta).Scan(&viejo)
		return viejo
	}
	return false
}

// AbrirReclamo registra el problema para que la tienda responda y VendiGo medie. Un solo módulo para todo:
// pago no reconocido, pedido no entregado, dañado, distinto o incompleto.
// Si pagaba al recibir y no le llegó, no hay nada que reclamar: no pagó.
func AbrirReclamo(ctx context.Context, tx *sql.Tx, pid, motivo, descripcion string, fotos []string) error {
	var tid, codigo, entrega, estado, pago string
	var entregado *time.Time
	var comprobante sql.NullString
	err := tx.QueryRowContext(ctx, `SELECT p.tienda_id, p.codigo, p.entrega, p.estado, p.entregado_en, g.estado, g.comprobante_key FROM pedidos p JOIN pagos g ON g.pedido_id=p.id
		WHERE p.id::text=$1 FOR UPDATE OF p`, pid).Scan(&tid, &codigo, &entrega, &estado, &entregado, &pago, &comprobante)
	if err != nil {
		return httpx.ErrNoEncontrado
	}
	if _, ok := MotivosReclamo[motivo]; !ok {
		return httpx.Invalido("Elige el motivo del reclamo.")
	}
	if fotos == nil {
		fotos = []string{}
	}
	if motivo == "pago_no_reconocido" {
		if !PuedeReclamarPago(ctx, tx, pid, estado, pago) {
			return httpx.Conflicto("estado_invalido", "Puedes reclamar tu pago si la tienda dice que no le llegó, o si no revisa tu comprobante en 48 horas.")
		}
		// El comprobante que subió el comprador va como su prueba.
		if comprobante.Valid && comprobante.String != "" {
			fotos = append([]string{comprobante.String}, fotos...)
		}
	} else {
		if motivo == "no_llego" && pago == "paga_al_recibir" {
			return httpx.Invalido("Pagas al recibir: si no llega, no pagas nada.")
		}
		if estado != "enviado" && estado != "entregado" {
			return httpx.Conflicto("estado_invalido", "Solo puedes reclamar un pedido enviado o entregado.")
		}
		if estado == "entregado" && entregado != nil && time.Since(*entregado) > DiasReclamo*24*time.Hour {
			return httpx.Conflicto("plazo_vencido", "El plazo para reclamar este pedido ya terminó (7 días después de recibirlo).")
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO reclamos (pedido_id, motivo, descripcion, fotos) VALUES ($1,$2,$3,$4)`,
		pid, motivo, descripcion, pq.Array(fotos)); err != nil {
		if strings.Contains(err.Error(), "reclamos_pedido_id_key") {
			return httpx.Conflicto("reclamo_existe", "Este pedido ya tiene un reclamo.")
		}
		return err
	}
	if err := evento(ctx, tx, pid, "reclamo", "Abriste un reclamo: "+MotivosReclamo[motivo]+". La tienda tiene 48 horas para responder."); err != nil {
		return err
	}
	aviso := "Responde en 48 horas con tu prueba (boleta de envío, conversación, fotos). Si no respondes, tu tienda deja de recibir pedidos hasta que lo hagas y VendiGo revisa el caso."
	if motivo == "pago_no_reconocido" {
		aviso = "El cliente dice que te pagó y adjuntó su comprobante. Revisa tu Yape, Plin o banco: si te llegó, toca \"Sí me llegó\" y sigue con el pedido; " +
			"si te llegó pero no puedes atenderlo, registra la devolución; si no te llegó, responde con tu prueba. Tienes 48 horas."
	}
	billetera.Notificar(ctx, tx, tid, "Reclamo en el pedido "+codigo, aviso, "/vendedor/cobros/reclamo/"+pid)
	billetera.SMSTienda(ctx, tx, tid, "Reclamo en el pedido "+codigo+" ("+MotivosReclamo[motivo]+"). Tienes 48 horas para responder:", "/vendedor/cobros/reclamo/"+pid)
	return nil
}
