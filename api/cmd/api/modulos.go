package main

import (
	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/auth"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// registrarModulos monta las rutas de cada módulo del monolito.
func registrarModulos(app *core.App, api chi.Router) {
	mAuth := auth.Nuevo(app)

	// Públicas
	api.Route("/auth", mAuth.RutasPublicas)

	// Con sesión
	api.Group(func(r chi.Router) {
		r.Use(httpx.Autenticar(app.Cfg.JWTSecreto))
		mAuth.RutasPrivadas(r)
	})
}
