package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/solanchveliz-dev/vendigo/api/internal/archivos"
	"github.com/solanchveliz-dev/vendigo/api/internal/avisos"
	"github.com/solanchveliz-dev/vendigo/api/internal/config"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/db"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
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
	cif, err := seguridad.NuevoCifrador(cfg.LlaveCifrado)
	if err != nil {
		slog.Error("cifrado", "err", err)
		os.Exit(1)
	}
	almacen, err := archivos.Nuevo(ctx, cfg)
	if err != nil {
		slog.Error("almacenamiento", "err", err)
		os.Exit(1)
	}
		if cfg.S3Endpoint != "" {
		if err := almacen.PrepararLocal(ctx); err != nil {
			slog.Warn("no se pudieron preparar los buckets locales", "err", err)
		}
	}
	var notificador core.Notificador = core.NotificadorConsola{}
	if cfg.OTPCanal == "sms" {
		if notificador, err = avisos.NuevoSNS(ctx, cfg.S3Region); err != nil {
			slog.Error("sms", "err", err)
			os.Exit(1)
		}
	}
	app := &core.App{Cfg: cfg, DB: conexion, Cifrador: cif, Archivos: almacen, Avisos: notificador}

	srv := &http.Server{
		Addr:              ":" + cfg.Puerto,
		Handler:           rutas(app),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
	}
	go func() {
		slog.Info("API de VendiGo lista", "puerto", cfg.Puerto, "entorno", cfg.Entorno)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("servidor", "err", err)
			os.Exit(1)
		}
	}()

	parar := make(chan os.Signal, 1)
	signal.Notify(parar, syscall.SIGINT, syscall.SIGTERM)
	<-parar
	c, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	srv.Shutdown(c)
}

func rutas(app *core.App) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Use(httpx.Registro, httpx.Seguridad, httpx.CORS(app.Cfg.WebURL))

	r.Get("/salud", func(w http.ResponseWriter, r *http.Request) {
		if err := app.DB.PingContext(r.Context()); err != nil {
			httpx.JSON(w, http.StatusServiceUnavailable, map[string]string{"estado": "sin base de datos"})
			return
		}
		httpx.OK(w, map[string]string{"estado": "ok"})
	})

	r.Route("/api/v1", func(api chi.Router) {
		registrarModulos(app, api)
	})
	return r
}
