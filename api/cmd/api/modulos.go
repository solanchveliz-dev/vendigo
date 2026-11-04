package main

import (
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/auth"
	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/demo"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
	"github.com/solanchveliz-dev/vendigo/api/internal/planes"
	"github.com/solanchveliz-dev/vendigo/api/internal/productos"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// registrarModulos monta las rutas de cada módulo del monolito.
func registrarModulos(app *core.App, api chi.Router) {
	mAuth := auth.Nuevo(app)
	mTiendas := tiendas.Nuevo(app)
	mProductos := productos.Nuevo(app)
	mPedidos := pedidos.Nuevo(app)
	mBilletera := billetera.Nuevo(app)
	mPlanes := planes.Nuevo(app)

	mAuth.TiendaDe = mTiendas.DeUsuario
	mPedidos.ValidarCupo = mPlanes.ValidarCupo

	// Públicas
	api.Route("/auth", mAuth.RutasPublicas)
	api.Group(func(r chi.Router) {
		r.Use(httpx.Limite(300, time.Minute))
		mTiendas.RutasPublicas(r)
		mProductos.RutasPublicas(r)
		mPlanes.RutasPublicas(r)
	})

	// Con sesión
	api.Group(func(r chi.Router) {
		r.Use(httpx.Autenticar(app.Cfg.JWTSecreto))
		mAuth.RutasPrivadas(r)
		mTiendas.RutasCuenta(r)

		r.Route("/vendedor", func(v chi.Router) {
			v.Use(httpx.Rol("vendedor"))
			mTiendas.RutasVendedor(v)
			mProductos.RutasVendedor(v)
			mPedidos.RutasVendedor(v)
			mBilletera.RutasVendedor(v)
			mPlanes.RutasVendedor(v)
		})

		if app.Cfg.EsDev() {
			r.Route("/dev", func(d chi.Router) {
				d.Use(httpx.Rol("vendedor"))
				demo.Nuevo(app).Rutas(d)
			})
		}
	})
}
