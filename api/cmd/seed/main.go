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
	// En el servidor la tienda de demostración solo se carga a propósito, y nunca con el administrador de
	// prueba: su contraseña es pública y quien entre primero configuraría la autenticación en dos pasos.
	if !cfg.EsDev() && os.Getenv("SEED_SERVIDOR") != "1" {
		fmt.Println("Fuera de local, el seed necesita SEED_SERVIDOR=1. El administrador se crea con cmd/admin.")
		os.Exit(1)
	}
	// En el servidor la vendedora de demostración no usa la contraseña pública de local.
	claveDemo := "vendigo123"
	if !cfg.EsDev() {
		if claveDemo = os.Getenv("SEED_CLAVE"); len(claveDemo) < 10 {
			fmt.Println("En el servidor define SEED_CLAVE (mínimo 10 caracteres) para la cuenta de la tienda demo.")
			os.Exit(1)
		}
	}
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

	if cfg.EsDev() {
		adminDemo(ctx, conexion)
	}
	defer verificacionDemo(ctx, conexion, s3, cif)
	var existe bool
	conexion.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM usuarios WHERE celular='999888777')`).Scan(&existe)
	if existe {
		if n := reponerFotos(ctx, conexion, s3); n > 0 {
			fmt.Printf("Se volvieron a subir %d fotos de prueba que faltaban.\n", n)
		}
		visitasDemo(ctx, conexion)
		historialDemo(ctx, conexion)
		agenciasDemo(ctx, conexion)
		fmt.Println("Los datos de prueba ya existen. Usuario: 999888777")
		if cfg.EsDev() {
			fmt.Println("Administrador de prueba: admin@vendigo.pe · Contraseña: Admin2026 (la primera vez configura tu app de autenticación)")
		}
		return
	}
	hash, _ := seguridad.HashPassword(claveDemo)
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
		p := pedidos.PedidoNuevo{TiendaID: tid, Nombre: nombre, Celular: "987654321", Entrega: entrega, MetodoPago: "yape_directo", Prueba: true, Items: items}
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
		return pedidos.MarcarEntregado(ctx, tx, listo, "comprador")
	})
	visitasDemo(ctx, conexion)
	historialDemo(ctx, conexion)
	agenciasDemo(ctx, conexion)
	fmt.Printf("Datos de prueba listos (%d imágenes subidas).\nUsuario: 999888777 · Contraseña: %s\n", subidas, claveDemo)
	if cfg.EsDev() {
		fmt.Println("Administrador de prueba: admin@vendigo.pe · Contraseña: Admin2026 (la primera vez configura tu app de autenticación)")
	}
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
			metodo, momento := []string{"yape_directo", "plin_directo", "yape_directo"}[n%3], "antes"
			if entrega == "motorizado" {
				momento = "al_recibir"
			}
			total := p.precio * unidades
			var pid string
			if err := conexion.QueryRowContext(ctx, `INSERT INTO pedidos (tienda_id, comprador_nombre, comprador_celular, entrega, estado, metodo_pago, pago_estado,
				subtotal_centimos, total_centimos, confirmado_por,
				creado_en, aceptado_en, enviado_en, entregado_en, cerrado_en)
				VALUES ($1,$2,$3,$4,'entregado',$5,'pendiente',$6,$6,'comprador',
				now() - make_interval(days => $7), now() - make_interval(days => $7) + interval '2 hours',
				now() - make_interval(days => $7) + interval '1 day', now() - make_interval(days => $7) + interval '3 days',
				now() - make_interval(days => $7) + interval '6 days') RETURNING id`,
				tid, c[0], c[1], entrega, metodo, total, hace).Scan(&pid); err != nil {
				fmt.Println("historial:", err)
				return
			}
			conexion.ExecContext(ctx, `INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio_centimos, cantidad) VALUES ($1,$2,$3,$4,$5)`,
				pid, p.id, p.nombre, p.precio, unidades)
			// Historial de prueba: su pago queda marcado como "de prueba" (nunca hubo un cobro real).
			conexion.ExecContext(ctx, `INSERT INTO pagos (pedido_id, origen, metodo, momento, estado, monto_centimos, creado_en)
				VALUES ($1,'prueba',$2,$3,'de_prueba',$4, now() - make_interval(days => $5))`, pid, metodo, momento, total, hace)
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

// adminDemo crea el administrador de prueba (solo en local; en producción se usa cmd/admin).
func adminDemo(ctx context.Context, conexion *sql.DB) {
	var existe bool
	conexion.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM usuarios WHERE celular='900000001')`).Scan(&existe)
	if existe {
		return
	}
	hash, _ := seguridad.HashPassword("Admin2026")
	conexion.ExecContext(ctx, `INSERT INTO usuarios (nombre, celular, email, password_hash, rol, celular_verificado)
		VALUES ('Equipo VendiGo', '900000001', 'admin@vendigo.pe', $1, 'admin', true)`, hash)
}

// agenciasDemo carga algunas sedes de agencias para la demo (solo si no hay ninguna).
// El admin las revisa, edita o desactiva desde "Agencias".
func agenciasDemo(ctx context.Context, conexion *sql.DB) {
	var hay bool
	conexion.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM agencias_sedes)`).Scan(&hay)
	if hay {
		return
	}
	sedes := [][4]string{
		{"Shalom", "Lima", "Shalom Jesús María", "Av. Brasil 1250, Jesús María"},
		{"Shalom", "Lima", "Shalom Los Olivos", "Av. Universitaria 7020, Los Olivos"},
		{"Shalom", "Lima", "Shalom Surco", "Av. Tomás Marsano 3050, Surco"},
		{"Shalom", "Lima", "Shalom La Victoria", "Av. Aviación 820, La Victoria"},
		{"Shalom", "Arequipa", "Shalom Arequipa Centro", "Av. Parra 205, Arequipa"},
		{"Shalom", "Trujillo", "Shalom Trujillo", "Av. América Norte 1540, Trujillo"},
		{"Shalom", "Cusco", "Shalom Cusco", "Av. de la Cultura 1720, Cusco"},
		{"Shalom", "Piura", "Shalom Piura", "Av. Sánchez Cerro 1450, Piura"},
		{"Olva Courier", "Lima", "Olva Miraflores", "Av. Benavides 1180, Miraflores"},
		{"Olva Courier", "Arequipa", "Olva Arequipa", "Calle San Juan de Dios 310, Arequipa"},
		{"Marvisur", "Arequipa", "Marvisur Arequipa", "Av. Salaverry 115, Arequipa"},
		{"Marvisur", "Lima", "Marvisur Lima", "Av. 28 de Julio 1250, La Victoria"},
	}
	for _, s := range sedes {
		conexion.ExecContext(ctx, `INSERT INTO agencias_sedes (agencia, ciudad, nombre, direccion, de_ejemplo) VALUES ($1,$2,$3,$4,true) ON CONFLICT DO NOTHING`, s[0], s[1], s[2], s[3])
	}
}

// verificacionDemo deja la tienda de prueba con su DNI enviado y "por revisar" (con fotos de prueba), para que en la
// demo el admin la apruebe y la tienda aparezca para los compradores. No toca tiendas que ya tienen verificación.
func verificacionDemo(ctx context.Context, conexion *sql.DB, s3 *archivos.S3, cif *seguridad.Cifrador) {
	var tid string
	var tiene bool
	if conexion.QueryRowContext(ctx, `SELECT t.id, EXISTS(SELECT 1 FROM verificaciones v WHERE v.tienda_id=t.id AND v.clase='identidad')
		FROM tiendas t WHERE slug='luna-y-sol'`).Scan(&tid, &tiene) != nil || tiene {
		return
	}
	keys := map[string]string{}
	for i, parte := range []string{"frente", "reverso", "selfie"} {
		key := fmt.Sprintf("dni/%s/demo-%s.png", tid, parte)
		if s3 != nil {
			s3.Subir(ctx, false, key, "image/png", imagen(color.RGBA{uint8(120 + 40*i), 150, 170, 255}))
		}
		keys[parte] = key
	}
	numero := "45678912"
	cifrado := numero
	if cif != nil {
		if c, err := cif.Cifrar(numero); err == nil {
			cifrado = c
		}
	}
	if _, err := conexion.ExecContext(ctx, `INSERT INTO verificaciones (tienda_id, tipo_documento, numero_cifrado, ultimos4, nombre_completo, frente_key, reverso_key, selfie_key, clase)
		VALUES ($1, 'dni', $2, $3, 'Camila Rojas', $4, $5, $6, 'identidad')`, tid, cifrado, numero[len(numero)-4:], keys["frente"], keys["reverso"], keys["selfie"]); err != nil {
		slog.Error("verificación de prueba", "err", err)
		return
	}
	fmt.Println("La tienda de prueba Luna & Sol tiene su DNI \"por revisar\": apruébalo en el panel admin (Vendedores) para que aparezca.")
}
