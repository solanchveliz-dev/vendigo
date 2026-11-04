package main

import (
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/auth"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/productos"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// registrarModulos monta las rutas de cada módulo del monolito.
func registrarModulos(app *core.App, api chi.Router) {
	mAuth := auth.Nuevo(app)
	mTiendas := tiendas.Nuevo(app)
	mProductos := productos.Nuevo(app)

	mAuth.TiendaDe = mTiendas.DeUsuario

	// Públicas
	api.Route("/auth", mAuth.RutasPublicas)
	api.Group(func(r chi.Router) {
		r.Use(httpx.Limite(300, time.Minute))
		mTiendas.RutasPublicas(r)
		mProductos.RutasPublicas(r)
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
		})
	})
}
