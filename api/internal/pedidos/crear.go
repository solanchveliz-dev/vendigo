package pedidos

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"math/big"
	"strings"

	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
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
	MetodoPago  string
	CulqiCargo  string
	Nota        string
	Items       []ItemNuevo
}

func codigoRecojo() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(10000))
	return fmt.Sprintf("%04d", n.Int64())
}

// Crear registra un pedido pagado (o con pago al recibir), reserva el stock y anota el cobro "a liberar".
// Lo usan el checkout del comprador y los datos de prueba.
func Crear(ctx context.Context, app *core.App, tx *sql.Tx, in PedidoNuevo) (string, string, error) {
	if len(in.Items) == 0 {
		return "", "", httpx.Invalido("El pedido no tiene productos.")
	}
	var recojo, agencia, moto bool
	var costoMoto int
	if err := tx.QueryRowContext(ctx, `SELECT entrega_recojo, entrega_agencia, entrega_motorizado, costo_motorizado_centimos FROM tiendas WHERE id=$1 AND activa`,
		in.TiendaID).Scan(&recojo, &agencia, &moto, &costoMoto); err != nil {
		if core.SinFilas(err) {
			return "", "", httpx.ErrNoEncontrado
		}
		return "", "", err
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
		in.MetodoPago = "al_recibir"
	default:
		return "", "", httpx.Invalido("Elige una forma de entrega.")
	}
	pago := "pagado"
	if in.MetodoPago == "al_recibir" {
		pago = "pendiente"
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
	total := subtotal + envio

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
	var culqi any
	if in.CulqiCargo != "" {
		culqi = in.CulqiCargo
	}
	var pid, codigo string
	err := tx.QueryRowContext(ctx, `INSERT INTO pedidos (tienda_id, comprador_id, comprador_nombre, comprador_celular, comprador_dni_cifrado, entrega,
		direccion, distrito, ciudad, referencia, agencia, agencia_sede, codigo_recojo, metodo_pago, pago_estado, culqi_cargo_id,
		subtotal_centimos, envio_centimos, total_centimos, nota_comprador)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id, codigo`,
		in.TiendaID, comprador, in.Nombre, in.Celular, dni, in.Entrega, in.Direccion, in.Distrito, in.Ciudad, in.Referencia,
		in.Agencia, in.AgenciaSede, codigoRecojo(), in.MetodoPago, pago, culqi, subtotal, envio, total, in.Nota).Scan(&pid, &codigo)
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
	detalle := "Pagaste con pago protegido. Tu dinero queda seguro hasta que recibas el pedido."
	if pago == "pagado" {
		if _, err := billetera.RegistrarCobro(ctx, tx, in.TiendaID, pid, codigo, total); err != nil {
			return "", "", err
		}
	} else {
		detalle = "Pagas cuando el motorizado te entregue el pedido."
	}
	if err := evento(ctx, tx, pid, "por_aceptar", detalle); err != nil {
		return "", "", err
	}
	billetera.Notificar(ctx, tx, in.TiendaID, "Nuevo pedido "+codigo, fmt.Sprintf("%s hizo un pedido de S/ %.2f. Acéptalo para empezar a prepararlo.", in.Nombre, float64(total)/100), "/vendedor/pedidos/"+pid)
	return pid, codigo, nil
}

// PagarAlRecibir: el comprador paga al motorizado desde su app y con eso confirma la entrega.
func PagarAlRecibir(ctx context.Context, tx *sql.Tx, pid string) error {
	var tid, codigo, rep, estado string
	var total int
	err := tx.QueryRowContext(ctx, `SELECT p.tienda_id, p.codigo, t.reputacion, p.estado, p.total_centimos FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id
		WHERE p.id::text=$1 AND p.metodo_pago='al_recibir' FOR UPDATE`, pid).Scan(&tid, &codigo, &rep, &estado, &total)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	if estado != "enviado" {
		return httpx.Conflicto("estado_invalido", "El pedido todavía no está en camino.")
	}
	if _, err := tx.ExecContext(ctx, `UPDATE pedidos SET pago_estado='pagado' WHERE id=$1`, pid); err != nil {
		return err
	}
	if _, err := billetera.RegistrarCobro(ctx, tx, tid, pid, codigo, total); err != nil {
		return err
	}
	return billetera.MarcarEntregado(ctx, tx, tid, pid, codigo, rep, "comprador")
}

// ConfirmarRecibido: el comprador confirma que le llegó (agencia).
func ConfirmarRecibido(ctx context.Context, tx *sql.Tx, pid string) error {
	var tid, codigo, rep, estado, metodo string
	err := tx.QueryRowContext(ctx, `SELECT p.tienda_id, p.codigo, t.reputacion, p.estado, p.metodo_pago FROM pedidos p JOIN tiendas t ON t.id=p.tienda_id
		WHERE p.id::text=$1 FOR UPDATE`, pid).Scan(&tid, &codigo, &rep, &estado, &metodo)
	if core.SinFilas(err) {
		return httpx.ErrNoEncontrado
	}
	if err != nil {
		return err
	}
	if metodo == "al_recibir" {
		return PagarAlRecibir(ctx, tx, pid)
	}
	if estado != "enviado" {
		return httpx.Conflicto("estado_invalido", "El pedido todavía no fue enviado.")
	}
	return billetera.MarcarEntregado(ctx, tx, tid, pid, codigo, rep, "comprador")
}

// AbrirReclamo bloquea el dinero mientras VendiGo revisa las pruebas.
// Con motorizado no hay reclamo de "no me llegó": si no llega, el comprador no paga.
func AbrirReclamo(ctx context.Context, tx *sql.Tx, pid, motivo, descripcion string, fotos []string) error {
	var tid, codigo, entrega, estado string
	var liberado bool
	err := tx.QueryRowContext(ctx, `SELECT tienda_id, codigo, entrega, estado, liberado FROM pedidos WHERE id::text=$1 FOR UPDATE`, pid).
		Scan(&tid, &codigo, &entrega, &estado, &liberado)
	if err != nil {
		return httpx.ErrNoEncontrado
	}
	if _, ok := MotivosReclamo[motivo]; !ok {
		return httpx.Invalido("Elige el motivo del reclamo.")
	}
	if entrega == "motorizado" && motivo == "no_llego" {
		return httpx.Invalido("Con motorizado pagas al recibir: si no llega, no pagas nada.")
	}
	if estado != "enviado" && estado != "entregado" {
		return httpx.Conflicto("estado_invalido", "Solo puedes reclamar un pedido enviado o entregado.")
	}
	if liberado {
		return httpx.Conflicto("plazo_vencido", "El plazo para reclamar este pedido ya terminó.")
	}
	if fotos == nil {
		fotos = []string{}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO reclamos (pedido_id, motivo, descripcion, fotos) VALUES ($1,$2,$3,$4)`,
		pid, motivo, descripcion, pq.Array(fotos)); err != nil {
		if strings.Contains(err.Error(), "reclamos_pedido_id_key") {
			return httpx.Conflicto("reclamo_existe", "Este pedido ya tiene un reclamo.")
		}
		return err
	}
	if err := evento(ctx, tx, pid, "reclamo", "Abriste un reclamo: "+MotivosReclamo[motivo]+". El dinero queda bloqueado hasta resolverlo."); err != nil {
		return err
	}
	billetera.Notificar(ctx, tx, tid, "Reclamo en el pedido "+codigo, "Responde con tu boleta de envío como prueba. El dinero queda bloqueado hasta resolverlo.", "/vendedor/pedidos/"+pid)
	return nil
}
