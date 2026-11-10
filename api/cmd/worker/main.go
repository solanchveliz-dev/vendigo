// Worker de tareas programadas: da por recibidos los envíos por agencia de más de 7 días y envía la bandeja de
// SMS (Amazon SNS). En el servidor corre en bucle; en local la API ya hace estas tareas sola (APP_ENV=dev).
package main

import (
	"context"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/avisos"
	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
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
	var notificador core.Notificador = core.NotificadorConsola{}
	if cfg.OTPCanal == "sms" {
		if notificador, err = avisos.NuevoSNS(ctx, cfg.S3Region); err != nil {
			slog.Error("sms", "err", err)
			os.Exit(1)
		}
	}
	app := &core.App{Cfg: cfg, DB: conexion, Avisos: notificador}

	pasada := func() { Tareas(ctx, app) }
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

// Tareas: una pasada del worker.
func Tareas(ctx context.Context, app *core.App) {
	if c, err := pedidos.Barrer(ctx, app); err != nil {
		slog.Error("barrido", "err", err)
	} else if c > 0 {
		slog.Info("barrido", "confirmados", c)
	}
	if n, err := billetera.EnviarSMSPendientes(ctx, app); err != nil {
		slog.Error("sms", "err", err)
	} else if n > 0 {
		slog.Info("sms enviados", "cantidad", n)
	}
}
