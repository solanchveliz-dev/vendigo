// Worker de tareas programadas. En AWS lo dispara Amazon EventBridge; en local corre en bucle.
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/config"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/db"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

func main() {
	unaVez := flag.Bool("una-vez", false, "ejecuta una sola pasada y termina (modo EventBridge)")
	cada := flag.Duration("cada", time.Minute, "cada cuánto revisar")
	flag.Parse()

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg := config.Carga()
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	conexion, err := db.Conectar(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("base de datos", "err", err)
		os.Exit(1)
	}
	defer conexion.Close()
	app := &core.App{Cfg: cfg, DB: conexion}

	pasada := func() {
		c, err := pedidos.Barrer(ctx, app)
		if err != nil {
			slog.Error("barrido", "err", err)
			return
		}
		slog.Info("barrido", "confirmados", c)
	}
	pasada()
	if *unaVez {
		return
	}
	t := time.NewTicker(*cada)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			pasada()
		}
	}
}
