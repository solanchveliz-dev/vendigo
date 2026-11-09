// Package demo simula las acciones del comprador mientras su perfil se construye.
// Solo se monta con APP_ENV=dev.
package demo

import (
	"database/sql"
	"math/rand/v2"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
	"github.com/solanchveliz-dev/vendigo/api/internal/productos"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

type Modulo struct{ app *core.App }

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

func (m *Modulo) Rutas(r chi.Router) {
	r.Method("POST", "/pedido", httpx.Handler(m.pedido))
	r.Method("POST", "/pedidos/{id}/confirmar", httpx.Handler(m.confirmar))
	r.Method("POST", "/pedidos/{id}/reclamo", httpx.Handler(m.reclamo))
	r.Method("POST", "/pedidos/{id}/ayuda", httpx.Handler(m.ayuda))
	r.Method("POST", "/pregunta", httpx.Handler(m.pregunta))
	r.Method("POST", "/barrer", httpx.Handler(m.barrer))
	r.Method("POST", "/verificacion/aprobar", httpx.Handler(m.aprobarVerificacion))
}

var nombres = []string{"Mariana Torres", "Diego Salazar", "Valeria Quispe", "Rodrigo Mendoza", "Camila Rojas", "Luis Huamán", "Andrea Flores"}
var distritos = []string{"Miraflores", "San Isidro", "Surco", "Los Olivos", "San Miguel", "La Molina", "Jesús María"}
var ciudades = []string{"Lima", "Arequipa", "Trujillo", "Cusco", "Piura", "Chiclayo"}

func (m *Modulo) pedido(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Entrega string `json:"entrega"`
	}
	httpx.Leer(r, &in)

	var recojo, agencia, moto bool
	m.app.DB.QueryRowContext(ctx, `SELECT entrega_recojo, entrega_agencia, entrega_motorizado FROM tiendas WHERE id=$1`, tid).Scan(&recojo, &agencia, &moto)
	opciones := []string{}
	if recojo {
		opciones = append(opciones, "recojo")
	}
	if agencia {
		opciones = append(opciones, "agencia")
	}
	if moto {
		opciones = append(opciones, "motorizado")
	}
	if in.Entrega == "" && len(opciones) > 0 {
		in.Entrega = opciones[rand.IntN(len(opciones))]
	}

	rows, err := m.app.DB.QueryContext(ctx, `SELECT p.id, (SELECT v.id FROM producto_variantes v WHERE v.producto_id=p.id AND v.stock>0 ORDER BY random() LIMIT 1)
		FROM productos p WHERE p.tienda_id=$1 AND p.activo AND NOT p.eliminado AND p.stock>0 ORDER BY random() LIMIT 2`, tid)
	if err != nil {
		return err
	}
	var items []pedidos.ItemNuevo
	for rows.Next() {
		var pid string
		var vid sql.NullString
		rows.Scan(&pid, &vid)
		items = append(items, pedidos.ItemNuevo{ProductoID: pid, VarianteID: vid.String, Cantidad: 1})
	}
	rows.Close()
	if len(items) == 0 {
		return httpx.Invalido("Primero publica al menos un producto con stock.")
	}
	n := nombres[rand.IntN(len(nombres))]
	p := pedidos.PedidoNuevo{
		TiendaID: tid, Nombre: n, Celular: "9" + digitos(8), Entrega: in.Entrega,
		MetodoPago: []string{"yape", "tarjeta", "yape"}[rand.IntN(3)], CulqiCargo: "chr_test_" + digitos(10),
		Items: items,
	}
	switch in.Entrega {
	case "agencia":
		p.DNI = digitos(8)
		p.Ciudad = ciudades[rand.IntN(len(ciudades))]
		p.Agencia = "Shalom"
		p.AgenciaSede = "Shalom " + p.Ciudad + " Centro"
	case "motorizado":
		p.Ciudad, p.Distrito = "Lima", distritos[rand.IntN(len(distritos))]
		p.Direccion = "Av. Los Próceres 245, dpto 302"
		p.Referencia = "Frente al parque"
	}
	var pid, codigo string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var err error
		pid, codigo, err = pedidos.Crear(ctx, m.app, tx, p)
		return err
	})
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": pid, "codigo": codigo})
	return nil
}

func digitos(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte('0' + rand.IntN(10))
	}
	return string(b)
}

func (m *Modulo) propio(r *http.Request) (string, error) {
	tid, err := tiendas.ID(r.Context(), m.app)
	if err != nil {
		return "", err
	}
	pid := chi.URLParam(r, "id")
	var ok bool
	m.app.DB.QueryRowContext(r.Context(), `SELECT EXISTS(SELECT 1 FROM pedidos WHERE id::text=$1 AND tienda_id=$2)`, pid, tid).Scan(&ok)
	if !ok {
		return "", httpx.ErrNoEncontrado
	}
	return pid, nil
}

func (m *Modulo) confirmar(w http.ResponseWriter, r *http.Request) error {
	pid, err := m.propio(r)
	if err != nil {
		return err
	}
	if err := m.app.EnTransaccion(r.Context(), func(tx *sql.Tx) error { return pedidos.ConfirmarRecibido(r.Context(), tx, pid) }); err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "El comprador confirmó la entrega."})
	return nil
}

func (m *Modulo) reclamo(w http.ResponseWriter, r *http.Request) error {
	pid, err := m.propio(r)
	if err != nil {
		return err
	}
	var in struct {
		Motivo string `json:"motivo"`
	}
	httpx.Leer(r, &in)
	if in.Motivo == "" {
		in.Motivo = "no_llego"
	}
	err = m.app.EnTransaccion(r.Context(), func(tx *sql.Tx) error {
		return pedidos.AbrirReclamo(r.Context(), tx, pid, in.Motivo, "Pasaron varios días y no me llega. En la agencia me dicen que no figura.", nil)
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "El comprador abrió un reclamo."})
	return nil
}

var preguntas = []string{"¿Tienen en otro color?", "¿Hacen envíos a Arequipa?", "¿Cuánto demora en llegar?", "¿Es original?", "¿Tiene garantía?", "¿Hasta qué hora atienden?", "¿Cuánto cuesta?", "¿Viene en caja de regalo?"}

func (m *Modulo) pregunta(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var pid string
	m.app.DB.QueryRowContext(ctx, `SELECT id FROM productos WHERE tienda_id=$1 AND NOT eliminado ORDER BY random() LIMIT 1`, tid).Scan(&pid)
	if pid == "" {
		return httpx.Invalido("Primero publica al menos un producto.")
	}
	if err := productos.NuevaPregunta(ctx, m.app, pid, nombres[rand.IntN(len(nombres))], preguntas[rand.IntN(len(preguntas))]); err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "Llegó una pregunta nueva."})
	return nil
}

func (m *Modulo) barrer(w http.ResponseWriter, r *http.Request) error {
	c, l, err := billetera.Barrer(r.Context(), m.app)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]int{"confirmados": c, "liberados": l})
	return nil
}

// aprobarVerificacion simula la revisión del administrador.
func (m *Modulo) aprobarVerificacion(w http.ResponseWriter, r *http.Request) error {
	tid, err := tiendas.ID(r.Context(), m.app)
	if err != nil {
		return err
	}
	res, err := m.app.DB.ExecContext(r.Context(), `UPDATE verificaciones SET estado='aprobada', revisado_en=now() WHERE tienda_id=$1 AND estado='pendiente'`, tid)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.Invalido("No hay una verificación pendiente.")
	}
	httpx.OK(w, map[string]string{"mensaje": "Identidad verificada."})
	return nil
}

// ayuda simula que el comprador pide ayuda dentro de su pedido.
func (m *Modulo) ayuda(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var pid string
	m.app.DB.QueryRowContext(ctx, `SELECT id FROM pedidos WHERE id::text=$1 AND tienda_id=$2`, chi.URLParam(r, "id"), tid).Scan(&pid)
	if pid == "" {
		return httpx.ErrNoEncontrado
	}
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		return pedidos.AbrirAyuda(ctx, tx, pid, pedidos.MotivosAyuda[1], "¿Pueden enviarlo a la Shalom de Surco en vez de Arequipa?")
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"mensaje": "El comprador pidió ayuda con su pedido."})
	return nil
}
