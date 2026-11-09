package main

import (
	"net/http"

	"context"
	"log/slog"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/admin"
	"github.com/solanchveliz-dev/vendigo/api/internal/auth"
	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/demo"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/ia"
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

	var proveedor ia.Proveedor = ia.Simulado{}
	if app.Cfg.IAProveedor == "bedrock" {
		b, err := ia.NuevoBedrock(context.Background(), app.Cfg.IARegion, app.Cfg.IAModelo)
		if err != nil {
			slog.Error("ia", "err", err)
		} else {
			proveedor = b
		}
	}
	mIA := ia.Nuevo(app, proveedor)

	mAuth.TiendaDe = mTiendas.DeUsuario
	mPedidos.ValidarCupo = mPlanes.ValidarCupo
	mBilletera.Confirmar = mAuth.ConfirmarPaso
	httpx.AlDenegar = func(r *http.Request, u httpx.Usuario) {
		app.DB.ExecContext(r.Context(), `INSERT INTO accesos_denegados (usuario_id, rol, ruta, ip) VALUES ($1,$2,$3,$4)`,
			u.ID, u.Rol, r.URL.Path, httpx.IP(r))
	}

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
		r.Use(httpx.SoloActivos(app.DB))
		mAuth.RutasPrivadas(r)
		mTiendas.RutasCuenta(r)

		r.Route("/vendedor", func(v chi.Router) {
			v.Use(httpx.Rol("vendedor"))
			mTiendas.RutasVendedor(v)
			mProductos.RutasVendedor(v)
			mPedidos.RutasVendedor(v)
			mBilletera.RutasVendedor(v)
			mPlanes.RutasVendedor(v)
			mIA.RutasVendedor(v)
		})

		// Panel del administrador: solo cuentas con rol admin (no se pueden crear desde el registro).
		r.Route("/admin", func(a chi.Router) {
			a.Use(httpx.Rol("admin"))
			mAdmin := admin.Nuevo(app)
			mAdmin.EnviarCodigo = mAuth.GenerarOTP
			mAdmin.Rutas(a)
		})

		if app.Cfg.EsDev() {
			r.Route("/dev", func(d chi.Router) {
				d.Use(httpx.Rol("vendedor"))
				demo.Nuevo(app).Rutas(d)
			})
		}
	})
}
