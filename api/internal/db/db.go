package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log/slog"
	"sort"
	"time"

	_ "github.com/lib/pq"
)

//go:embed migraciones/*.sql
var migraciones embed.FS

func Conectar(ctx context.Context, url string) (*sql.DB, error) {
	db, err := sql.Open("postgres", url)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxIdleTime(5 * time.Minute)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("no se pudo conectar a la base de datos: %w", err)
	}
	return db, nil
}

// Migrar aplica en orden los archivos .sql que todavía no se ejecutaron.
func Migrar(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migraciones (
		nombre TEXT PRIMARY KEY,
		aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	archivos, err := migraciones.ReadDir("migraciones")
	if err != nil {
		return err
	}
	nombres := make([]string, 0, len(archivos))
	for _, a := range archivos {
		nombres = append(nombres, a.Name())
	}
	sort.Strings(nombres)

	for _, n := range nombres {
		var existe bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migraciones WHERE nombre=$1)`, n).Scan(&existe); err != nil {
			return err
		}
		if existe {
			continue
		}
		contenido, err := migraciones.ReadFile("migraciones/" + n)
		if err != nil {
			return err
		}
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, string(contenido)); err != nil {
			tx.Rollback()
			return fmt.Errorf("migración %s: %w", n, err)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migraciones(nombre) VALUES ($1)`, n); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		slog.Info("migración aplicada", "archivo", n)
	}
	return nil
}
