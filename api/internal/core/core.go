package core

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"

	"github.com/solanchveliz-dev/vendigo/api/internal/config"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

// App agrupa las dependencias que comparten todos los módulos.
type App struct {
	Cfg      config.Config
	DB       *sql.DB
	Cifrador *seguridad.Cifrador
	Archivos Almacen
	Avisos   Notificador
}

// Almacen abstrae el almacenamiento de archivos (Amazon S3 o MinIO).
type Almacen interface {
	URLSubida(ctx context.Context, publico bool, key, contentType string, tamano int64) (string, error)
	URLLectura(ctx context.Context, key string) (string, error)
	URLPublica(key string) string
	Existe(ctx context.Context, publico bool, key string) bool
	Leer(ctx context.Context, publico bool, key string) ([]byte, string, error)
}

// Notificador envía códigos y avisos (SNS, SES o consola en pruebas).
type Notificador interface {
	EnviarCodigo(ctx context.Context, celular, codigo string) error
	// EnviarTexto manda un SMS informativo (por ejemplo, el enlace de seguimiento de un pedido).
	EnviarTexto(ctx context.Context, celular, texto string) error
}

// NotificadorConsola muestra los códigos en la consola. Solo para desarrollo.
type NotificadorConsola struct{}

func (NotificadorConsola) EnviarTexto(_ context.Context, celular, texto string) error {
	slog.Info("SMS (solo desarrollo)", "celular", celular, "texto", texto)
	return nil
}

func (NotificadorConsola) EnviarCodigo(_ context.Context, celular, codigo string) error {
	slog.Info("código de verificación (solo desarrollo)", "celular", celular, "codigo", codigo)
	return nil
}

// Ejecutor es lo común entre la conexión y una transacción.
type Ejecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// Auditar registra una acción importante (dinero, reclamos, verificaciones).
func (a *App) Auditar(ctx context.Context, q Ejecutor, usuarioID, accion, entidad, entidadID string, datos any) {
	var raw any
	if datos != nil {
		b, _ := json.Marshal(datos)
		raw = string(b)
	}
	var uid any
	if usuarioID != "" {
		uid = usuarioID
	}
	if _, err := q.ExecContext(ctx, `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, datos) VALUES ($1,$2,$3,$4,$5)`,
		uid, accion, entidad, entidadID, raw); err != nil {
		slog.Error("no se pudo auditar", "accion", accion, "err", err)
	}
}

// EnTransaccion ejecuta fn dentro de una transacción; si fn devuelve error se revierte.
func (a *App) EnTransaccion(ctx context.Context, fn func(tx *sql.Tx) error) error {
	tx, err := a.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

func SinFilas(err error) bool { return errors.Is(err, sql.ErrNoRows) }
