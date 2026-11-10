package pruebas

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

// grabadora reemplaza a Amazon SNS en la prueba: guarda los SMS en vez de enviarlos.
type grabadora struct {
	textos []string
	fallar bool
}

func (g *grabadora) EnviarCodigo(_ context.Context, celular, codigo string) error { return nil }
func (g *grabadora) EnviarTexto(_ context.Context, celular, texto string) error {
	if g.fallar {
		return errors.New("SNS no disponible")
	}
	g.textos = append(g.textos, celular+" · "+texto)
	return nil
}

// Los avisos por SMS salen de una bandeja: se encolan con el cambio, se envían con su enlace, no se repiten,
// se reintentan si SNS falla y los pedidos de prueba nunca generan SMS.
func TestSMSBandejaDeSalida(t *testing.T) {
	necesitaBase(t)
	ctx := context.Background()
	g := &grabadora{}
	antes := app.Avisos
	app.Avisos = g
	app.Cfg.WebURL = "https://vendigo.pe"
	defer func() { app.Avisos = antes }()
	if _, err := base.Exec(`UPDATE sms_salientes SET enviado_en=now() WHERE enviado_en IS NULL`); err != nil {
		t.Fatal(err)
	}

	tid := crearTienda(t)
	verificar(t, tid, "identidad")
	pid := crearPedido(t, tid, "enviado", "informado_tienda", 1)

	// Un reclamo "No me llegó" avisa por SMS a la tienda.
	abrirReclamo(t, pid, "no_llego")
	if n := numero(t, `SELECT count(*) FROM sms_salientes WHERE enviado_en IS NULL AND texto LIKE 'Reclamo en el pedido%'`); n != 1 {
		t.Fatalf("el reclamo debía dejar 1 SMS para la tienda en la bandeja (hay %d)", n)
	}
	// Un aviso al comprador lleva el enlace de su seguimiento.
	enTransaccion(t, func(tx *sql.Tx) error {
		billetera.SMSComprador(ctx, tx, pid, "prueba de aviso al comprador")
		return nil
	})

	// Si SNS falla, quedan pendientes para reintentar.
	g.fallar = true
	if n, _ := billetera.EnviarSMSPendientes(ctx, app); n != 0 {
		t.Errorf("con SNS caído no debía enviarse nada (se enviaron %d)", n)
	}
	g.fallar = false
	n, err := billetera.EnviarSMSPendientes(ctx, app)
	if err != nil || n != 2 {
		t.Fatalf("debían enviarse 2 SMS al reintentar (enviados %d, error %v)", n, err)
	}
	todos := strings.Join(g.textos, "\n")
	if !strings.Contains(todos, "VendiGo: Reclamo en el pedido") || !strings.Contains(todos, "https://vendigo.pe/vendedor/cobros/reclamo/") {
		t.Errorf("el SMS de la tienda debía llevar el texto y el enlace a su panel:\n%s", todos)
	}
	if !strings.Contains(todos, "https://vendigo.pe/seguimiento/") {
		t.Errorf("el SMS del comprador debía llevar el enlace de su seguimiento:\n%s", todos)
	}
	if n, _ := billetera.EnviarSMSPendientes(ctx, app); n != 0 {
		t.Errorf("un SMS ya enviado no debe repetirse (se enviaron %d más)", n)
	}

	// Pedido de prueba (simulador): no genera SMS al comprador. (Otra tienda: la anterior quedó suspendida por el reclamo.)
	otra := crearTienda(t)
	verificar(t, otra, "identidad")
	var prueba string
	enTransaccion(t, func(tx *sql.Tx) error {
		var err error
		prueba, _, err = pedidos.Crear(ctx, app, tx, pedidos.PedidoNuevo{TiendaID: otra, Nombre: "Prueba", Celular: "988777666",
			Entrega: "recojo", MetodoPago: "yape_directo", Prueba: true,
			Items: []pedidos.ItemNuevo{{ProductoID: productoDePrueba(t, otra), Cantidad: 1}}})
		if err != nil {
			return err
		}
		billetera.SMSComprador(ctx, tx, prueba, "no debería encolarse")
		return nil
	})
	if n := numero(t, `SELECT count(*) FROM sms_salientes WHERE texto='no debería encolarse'`); n != 0 {
		t.Errorf("un pedido de prueba no debe generar SMS (hay %d)", n)
	}
}

func productoDePrueba(t *testing.T, tid string) string {
	t.Helper()
	return texto(t, `INSERT INTO productos (tienda_id, nombre, descripcion, categoria, precio_centimos, stock)
		VALUES ($1, 'Producto de prueba', 'Para la prueba de SMS', 'Otros', 2500, 5) RETURNING id::text`, tid)
}
