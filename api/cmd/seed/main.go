// Carga datos de prueba: una tienda con productos, pedidos en distintos estados y una pregunta.
// Usuario: 999888777 · Contraseña: vendigo123
package main

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log/slog"
	"os"
	"strings"

	"github.com/solanchveliz-dev/vendigo/api/internal/archivos"
	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/config"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/db"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

type prod struct {
	nombre, cat, desc string
	precio, stock     int
	variantes         []string
	color             color.RGBA
}

var catalogo = []prod{
	{"Aretes de filigrana con piedras", "Aretes", "Aretes hechos a mano en plata 950 con piedras naturales.", 4500, 12, nil, color.RGBA{0xC9, 0x8B, 0x5E, 255}},
	{"Collar luna de plata", "Collares", "Collar con dije de luna, cadena de 45 cm.", 6900, 8, nil, color.RGBA{0x9A, 0xA8, 0xB5, 255}},
	{"Anillo de plata floral", "Anillos", "Anillo ajustable con detalle de flor.", 3900, 0, []string{"Talla 6", "Talla 7", "Talla 8"}, color.RGBA{0xE0, 0xB4, 0xA0, 255}},
	{"Pulsera hilo encerado", "Pulseras", "Pulsera tejida a mano, resistente al agua.", 2500, 30, []string{"Negro", "Rojo", "Azul"}, color.RGBA{0x2F, 0x6F, 0x62, 255}},
	{"Set de aretes pequeños", "Aretes", "Set de 3 pares para uso diario.", 3500, 2, nil, color.RGBA{0xF2, 0x6B, 0x4F, 255}},
	{"Tobillera de conchitas", "Pulseras", "Tobillera con conchitas naturales.", 1900, 15, nil, color.RGBA{0xD8, 0xC3, 0x8E, 255}},
}

func imagen(c color.RGBA) []byte {
	img := image.NewRGBA(image.Rect(0, 0, 600, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 600; x++ {
			d := uint8((x + y) / 24)
			img.Set(x, y, color.RGBA{c.R - min(c.R, d), c.G - min(c.G, d), c.B - min(c.B, d), 255})
		}
	}
	var b bytes.Buffer
	png.Encode(&b, img)
	return b.Bytes()
}

func main() {
	cfg := config.Carga()
	ctx := context.Background()
	conexion, err := db.Conectar(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("base de datos", "err", err)
		os.Exit(1)
	}
	defer conexion.Close()
	if err := db.Migrar(ctx, conexion); err != nil {
		slog.Error("migraciones", "err", err)
		os.Exit(1)
	}
	cif, _ := seguridad.NuevoCifrador(cfg.LlaveCifrado)
	s3, _ := archivos.Nuevo(ctx, cfg)
	if cfg.S3Endpoint != "" {
		if err := s3.PrepararLocal(ctx); err != nil {
			slog.Warn("no se pudieron preparar los buckets locales", "err", err)
		}
	}
	app := &core.App{Cfg: cfg, DB: conexion, Cifrador: cif, Archivos: s3, Avisos: core.NotificadorConsola{}}

	var existe bool
	conexion.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM usuarios WHERE celular='999888777')`).Scan(&existe)
	if existe {
		if n := reponerFotos(ctx, conexion, s3); n > 0 {
			fmt.Printf("Se volvieron a subir %d fotos de prueba que faltaban.\n", n)
		}
		visitasDemo(ctx, conexion)
		historialDemo(ctx, conexion)
		fmt.Println("Los datos de prueba ya existen. Usuario: 999888777 · Contraseña: vendigo123")
		return
	}
	hash, _ := seguridad.HashPassword("vendigo123")
	var uid, tid string
	conexion.QueryRowContext(ctx, `INSERT INTO usuarios (nombre, celular, email, password_hash, rol, celular_verificado)
		VALUES ('Camila Rojas', '999888777', 'camila@lunaysol.pe', $1, 'vendedor', true) RETURNING id`, hash).Scan(&uid)
	conexion.QueryRowContext(ctx, `INSERT INTO tiendas (usuario_id, nombre, slug, rubro, descripcion, ciudad, distrito, instagram, whatsapp,
		direccion_recojo, horario_recojo, entrega_motorizado, costo_motorizado_centimos, zonas_motorizado, reputacion)
		VALUES ($1, 'Luna & Sol', 'luna-y-sol', 'accesorios', 'Joyería y accesorios hechos a mano en plata y hilo encerado.', 'Lima', 'Miraflores',
		'lunaysol.pe', '999888777', 'Av. Larco 345, Miraflores', 'Lunes a sábado de 10 a. m. a 7 p. m.', true, 1000, 'Miraflores, San Isidro, Surco, Barranco', 'buena')
		RETURNING id`, uid).Scan(&tid)
	conexion.ExecContext(ctx, `INSERT INTO suscripciones (tienda_id, plan_id) VALUES ($1,'gratis')`, tid)

	subidas := 0
	var ids []string
	for i, p := range catalogo {
		var pid string
		conexion.QueryRowContext(ctx, `INSERT INTO productos (tienda_id, nombre, descripcion, categoria, precio_centimos, stock) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
			tid, p.nombre, p.desc, p.cat, p.precio, p.stock).Scan(&pid)
		total := 0
		for j, v := range p.variantes {
			st := 4 + j
			total += st
			conexion.ExecContext(ctx, `INSERT INTO producto_variantes (producto_id, nombre, stock, orden) VALUES ($1,$2,$3,$4)`, pid, v, st, j)
		}
		if total > 0 {
			conexion.ExecContext(ctx, `UPDATE productos SET stock=$2 WHERE id=$1`, pid, total)
		}
		key := fmt.Sprintf("producto/%s/demo-%d.png", tid, i)
		if err := s3.Subir(ctx, true, key, "image/png", imagen(p.color)); err == nil {
			subidas++
		}
		conexion.ExecContext(ctx, `INSERT INTO producto_imagenes (producto_id, key) VALUES ($1,$2)`, pid, key)
		ids = append(ids, pid)
	}
	conexion.ExecContext(ctx, `INSERT INTO ofertas (producto_id, descuento_pct, termina_en) VALUES ($1, 20, now() + interval '3 days')`, ids[0])
	conexion.ExecContext(ctx, `INSERT INTO preguntas (producto_id, autor_nombre, pregunta) VALUES ($1, 'Andrea Flores', '¿Hacen envíos a Arequipa?')`, ids[1])

	nuevo := func(nombre, entrega string, items ...pedidos.ItemNuevo) string {
		p := pedidos.PedidoNuevo{TiendaID: tid, Nombre: nombre, Celular: "987654321", Entrega: entrega, MetodoPago: "yape", Items: items}
		if entrega == "agencia" {
			p.DNI, p.Ciudad, p.Agencia, p.AgenciaSede = "45678912", "Arequipa", "Shalom", "Shalom Arequipa Centro"
		}
		if entrega == "motorizado" {
			p.Ciudad, p.Distrito, p.Direccion = "Lima", "Surco", "Jr. Las Gardenias 120"
		}
		var pid string
		app.EnTransaccion(ctx, func(tx *sql.Tx) error {
			var err error
			pid, _, err = pedidos.Crear(ctx, app, tx, p)
			return err
		})
		return pid
	}
	it := func(i int) pedidos.ItemNuevo { return pedidos.ItemNuevo{ProductoID: ids[i], Cantidad: 1} }

	nuevo("Mariana Torres", "agencia", it(0))
	enviar := nuevo("Diego Salazar", "agencia", it(1))
	conexion.ExecContext(ctx, `UPDATE pedidos SET estado='preparando', aceptado_en=now() WHERE id=$1`, enviar)
	recojo := nuevo("Valeria Quispe", "recojo", it(5))
	conexion.ExecContext(ctx, `UPDATE pedidos SET estado='listo_recojo', aceptado_en=now() WHERE id=$1`, recojo)
	camino := nuevo("Rodrigo Mendoza", "agencia", it(4))
	conexion.ExecContext(ctx, `UPDATE pedidos SET estado='enviado', aceptado_en=now(), enviado_en=now() WHERE id=$1`, camino)
	conexion.ExecContext(ctx, `INSERT INTO envios (pedido_id, agencia, numero_orden, clave_recojo) VALUES ($1,'Shalom','00123456','4821')`, camino)
	listo := nuevo("Luis Huamán", "agencia", it(0))
	app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		tx.ExecContext(ctx, `UPDATE pedidos SET estado='enviado', aceptado_en=now() - interval '4 days', enviado_en=now() - interval '3 days',
			creado_en=now() - interval '4 days' WHERE id=$1`, listo)
		return billetera.MarcarEntregado(ctx, tx, tid, listo, "", "excelente", "comprador")
	})
	visitasDemo(ctx, conexion)
	historialDemo(ctx, conexion)
	fmt.Printf("Datos de prueba listos (%d imágenes subidas).\nUsuario: 999888777 · Contraseña: vendigo123\n", subidas)
}

// visitasDemo agrega visitas de los últimos 30 días a la tienda de prueba (solo si aún no tiene),
// para que "Rendimiento" y las sugerencias tengan datos en la demo.
func visitasDemo(ctx context.Context, conexion *sql.DB) {
	var tid string
	var hay bool
	conexion.QueryRowContext(ctx, `SELECT id, EXISTS(SELECT 1 FROM visitas v WHERE v.tienda_id=t.id AND v.dia < current_date)
		FROM tiendas t WHERE slug='luna-y-sol'`).Scan(&tid, &hay)
	if tid == "" || hay {
		return
	}
	conexion.ExecContext(ctx, `INSERT INTO visitas (tienda_id, producto_id, dia, cantidad)
		SELECT $1, NULL, current_date - d, 18 + (d * 7) % 13 FROM generate_series(1, 30) d
		ON CONFLICT DO NOTHING`, tid)
	conexion.ExecContext(ctx, `INSERT INTO visitas (tienda_id, producto_id, dia, cantidad)
		SELECT $1, p.id, current_date - d, 1 + ((d + p.n) * 5) % (CASE WHEN p.n = 3 THEN 9 ELSE 5 END)
		FROM (SELECT id, row_number() OVER (ORDER BY creado_en, id) AS n FROM productos WHERE tienda_id=$1 AND NOT eliminado) p,
		generate_series(1, 30) d
		ON CONFLICT DO NOTHING`, tid)
}

// historialDemo agrega 8 semanas de pedidos ya entregados a la tienda de prueba (solo si aún no tiene historial),
// para que la Analítica, el pronóstico y el analista de ventas tengan datos en la demo.
// Cada producto tiene un patrón: unos suben, otros bajan, otros se mantienen.
func historialDemo(ctx context.Context, conexion *sql.DB) {
	var tid string
	var hay bool
	conexion.QueryRowContext(ctx, `SELECT id, EXISTS(SELECT 1 FROM pedidos p WHERE p.tienda_id=t.id AND p.creado_en < now() - interval '14 days')
		FROM tiendas t WHERE slug='luna-y-sol'`).Scan(&tid, &hay)
	if tid == "" {
		return
	}
	// Una versión anterior marcaba el historial como retirado sin crear los retiros: se corrige.
	if res, _ := conexion.ExecContext(ctx, `DELETE FROM movimientos WHERE tienda_id=$1 AND tipo='retiro' AND retiro_id IS NULL AND detalle='Historial de prueba'`, tid); res != nil {
		if n, _ := res.RowsAffected(); n > 0 {
			fmt.Println("Se corrigió el historial de prueba: ese dinero ahora figura como disponible para retirar.")
		}
	}
	if hay {
		return
	}
	// unidades por semana (de la más antigua a la actual) para cada producto del catálogo
	patron := map[string][8]int{
		"Aretes de filigrana con piedras": {1, 1, 2, 2, 3, 3, 4, 3}, // sube
		"Collar luna de plata":            {4, 4, 3, 3, 2, 1, 1, 0}, // baja
		"Anillo de plata floral":          {1, 2, 1, 2, 1, 2, 1, 1}, // estable
		"Pulsera hilo encerado":           {2, 1, 2, 1, 2, 2, 1, 1}, // estable
		"Set de aretes pequeños":          {0, 1, 1, 1, 2, 2, 2, 2}, // sube y queda poco stock
	}
	clientes := [][2]string{{"Lucía Paredes", "981234110"}, {"Jhon Paredes", "984120998"}, {"Sofía Ramírez", "987300441"}, {"Mariela Torres", "986554210"},
		{"Andrea Torres", "989001122"}, {"Mariana Vega", "985443321"}, {"Diego Salazar", "984120998"}, {"Valeria Quispe", "987300441"}}
	rows, err := conexion.QueryContext(ctx, `SELECT id, nombre, precio_centimos FROM productos WHERE tienda_id=$1 AND NOT eliminado`, tid)
	if err != nil {
		return
	}
	type prod struct {
		id, nombre string
		precio     int
	}
	var prods []prod
	for rows.Next() {
		var p prod
		rows.Scan(&p.id, &p.nombre, &p.precio)
		prods = append(prods, p)
	}
	rows.Close()
	entregas := []string{"agencia", "agencia", "motorizado", "recojo"}
	n := 0
	for _, p := range prods {
		sem, ok := patron[p.nombre]
		if !ok {
			continue
		}
		for k, unidades := range sem {
			if unidades == 0 {
				continue
			}
			// semana k: entre (7-k)*7 y (7-k)*7+6 días atrás; la actual, entre 1 y 6 días atrás
			hace := (7-k)*7 + 1 + (n*5+k)%6
			if k == 6 {
				hace = 8 + (n*5+k)%6
			}
			c := clientes[n%len(clientes)]
			entrega := entregas[n%len(entregas)]
			metodo := []string{"yape", "tarjeta", "yape"}[n%3]
			if entrega == "motorizado" {
				metodo = "al_recibir"
			}
			total := p.precio * unidades
			comision := billetera.ComisionPasarela(total)
			if metodo == "al_recibir" {
				comision = 0
			}
			neto := total - comision
			var pid string
			if err := conexion.QueryRowContext(ctx, `INSERT INTO pedidos (tienda_id, comprador_nombre, comprador_celular, entrega, estado, metodo_pago, pago_estado,
				subtotal_centimos, total_centimos, comision_pasarela_centimos, confirmado_por, liberado, liberar_en,
				creado_en, aceptado_en, enviado_en, entregado_en, cerrado_en)
				VALUES ($1,$2,$3,$4,'entregado',$5,'pagado',$6,$6,$7,'comprador',true,
				now() - make_interval(days => $8) + interval '6 days',
				now() - make_interval(days => $8), now() - make_interval(days => $8) + interval '2 hours',
				now() - make_interval(days => $8) + interval '1 day', now() - make_interval(days => $8) + interval '3 days',
				now() - make_interval(days => $8) + interval '6 days') RETURNING id`,
				tid, c[0], c[1], entrega, metodo, total, comision, hace).Scan(&pid); err != nil {
				fmt.Println("historial:", err)
				return
			}
			conexion.ExecContext(ctx, `INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio_centimos, cantidad) VALUES ($1,$2,$3,$4,$5)`,
				pid, p.id, p.nombre, p.precio, unidades)
			// El dinero ya se cobró y se liberó: queda disponible para retirar.
			for _, mv := range []struct {
				tipo, bolsa string
				monto       int
			}{{"cobro", "a_liberar", total}, {"comision_pasarela", "a_liberar", -comision}, {"liberacion", "a_liberar", -neto},
				{"liberacion", "disponible", neto}} {
				if mv.monto != 0 {
					conexion.ExecContext(ctx, `INSERT INTO movimientos (tienda_id, pedido_id, tipo, bolsa, monto_centimos, detalle, creado_en)
						VALUES ($1,$2,$3,$4,$5,'Historial de prueba', now() - make_interval(days => $6))`, tid, pid, mv.tipo, mv.bolsa, mv.monto, hace)
				}
			}
			n++
		}
	}
	fmt.Printf("Se agregó un historial de %d pedidos entregados para la analítica.\n", n)
}

// reponerFotos vuelve a subir las fotos de prueba que no estén en el almacenamiento
// (por ejemplo, si el seed corrió antes de que existieran los buckets).
func reponerFotos(ctx context.Context, conexion *sql.DB, s3 *archivos.S3) int {
	filas, err := conexion.QueryContext(ctx, `SELECT key FROM producto_imagenes WHERE key LIKE 'producto/%/demo-%.png'`)
	if err != nil {
		return 0
	}
	defer filas.Close()
	n := 0
	for filas.Next() {
		var key string
		if filas.Scan(&key) != nil || s3.Existe(ctx, true, key) {
			continue
		}
		var i int
		if _, err := fmt.Sscanf(key[strings.LastIndex(key, "/")+1:], "demo-%d.png", &i); err != nil || i < 0 || i >= len(catalogo) {
			continue
		}
		if s3.Subir(ctx, true, key, "image/png", imagen(catalogo[i].color)) == nil {
			n++
		}
	}
	return n
}
