// Crea una cuenta de administrador. Las cuentas admin no se pueden crear desde la web:
// solo quien tiene acceso al servidor puede ejecutar este comando.
//
//	ADMIN_PASSWORD='Una-Clave-Segura1' go run ./cmd/admin -nombre "Nombre Apellido" -celular 9XXXXXXXX -email correo@vendigo.pe
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/solanchveliz-dev/vendigo/api/internal/config"
	"github.com/solanchveliz-dev/vendigo/api/internal/db"
	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

func main() {
	nombre := flag.String("nombre", "", "nombre completo")
	celular := flag.String("celular", "", "celular de 9 dígitos")
	email := flag.String("email", "", "correo")
	flag.Parse()

	pass := os.Getenv("ADMIN_PASSWORD")
	fallar := func(m string) { fmt.Fprintln(os.Stderr, m); os.Exit(1) }
	if len(strings.TrimSpace(*nombre)) < 3 {
		fallar("Falta -nombre.")
	}
	if !regexp.MustCompile(`^9\d{8}$`).MatchString(*celular) {
		fallar("El -celular debe tener 9 dígitos y empezar con 9.")
	}
	if msg := seguridad.ValidarPassword(pass); msg != "" {
		fallar("ADMIN_PASSWORD: " + msg)
	}
	hash, err := seguridad.HashPassword(pass)
	if err != nil {
		fallar(err.Error())
	}

	ctx := context.Background()
	cfg := config.Carga()
	conexion, err := db.Conectar(ctx, cfg.DatabaseURL)
	if err != nil {
		fallar("No se pudo conectar a la base de datos: " + err.Error())
	}
	defer conexion.Close()
	if err := db.Migrar(ctx, conexion); err != nil {
		fallar(err.Error())
	}
	var correo any
	if *email != "" {
		correo = strings.ToLower(*email)
	}
	var id string
	err = conexion.QueryRowContext(ctx, `INSERT INTO usuarios (nombre, celular, email, password_hash, rol, celular_verificado)
		VALUES ($1,$2,$3,$4,'admin',true) RETURNING id`, *nombre, *celular, correo, hash).Scan(&id)
	if err != nil {
		fallar("No se pudo crear (¿el celular o correo ya tiene cuenta?): " + err.Error())
	}
	conexion.ExecContext(ctx, `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id) VALUES ($1,'crear_admin','usuario',$1)`, id)
	fmt.Println("Administrador creado. Ingresa en /ingresar con el celular", *celular)
}
