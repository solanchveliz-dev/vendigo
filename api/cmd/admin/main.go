// Crea una cuenta de administrador. Las cuentas admin no se pueden crear desde la web:
// solo quien tiene acceso al servidor puede ejecutar este comando.
//
//	ADMIN_PASSWORD='Una-Clave-Segura1' go run ./cmd/admin -nombre "Nombre Apellido" -celular 9XXXXXXXX -email correo@vendigo.pe
//
// El administrador ingresa con su correo y, la primera vez, configura su app de autenticación.
// Si pierde el celular y sus códigos de respaldo:
//
//	go run ./cmd/admin -email correo@vendigo.pe -reiniciar-mfa
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
	email := flag.String("email", "", "correo de la empresa (con él ingresa)")
	reiniciar := flag.Bool("reiniciar-mfa", false, "quita la app de autenticación para configurarla de nuevo")
	flag.Parse()
	if *reiniciar {
		reiniciarMFA(strings.ToLower(*email))
		return
	}

	pass := os.Getenv("ADMIN_PASSWORD")
	fallar := func(m string) { fmt.Fprintln(os.Stderr, m); os.Exit(1) }
	if len(strings.TrimSpace(*nombre)) < 3 {
		fallar("Falta -nombre.")
	}
	if !strings.Contains(*email, "@") {
		fallar("Falta -email: los administradores ingresan con su correo.")
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
	correo := strings.ToLower(*email)
	var id string
	err = conexion.QueryRowContext(ctx, `INSERT INTO usuarios (nombre, celular, email, password_hash, rol, celular_verificado)
		VALUES ($1,$2,$3,$4,'admin',true) RETURNING id`, *nombre, *celular, correo, hash).Scan(&id)
	if err != nil {
		fallar("No se pudo crear (¿el celular o correo ya tiene cuenta?): " + err.Error())
	}
	conexion.ExecContext(ctx, `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id) VALUES ($1,'crear_admin','usuario',$1)`, id)
	fmt.Println("Administrador creado. Ingresa en /ingresar con", correo, "y configura tu app de autenticación.")
}

func reiniciarMFA(email string) {
	ctx := context.Background()
	conexion, err := db.Conectar(ctx, config.Carga().DatabaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	defer conexion.Close()
	var id string
	err = conexion.QueryRowContext(ctx, `UPDATE usuarios SET totp_activo=false, totp_secreto_cifrado=NULL, totp_respaldo='{}', totp_ultimo_paso=0
		WHERE email=$1 AND rol='admin' RETURNING id`, email).Scan(&id)
	if err != nil {
		fmt.Fprintln(os.Stderr, "No hay un administrador con ese correo.")
		os.Exit(1)
	}
	conexion.ExecContext(ctx, `UPDATE refresh_tokens SET revocado=true WHERE usuario_id=$1`, id)
	conexion.ExecContext(ctx, `INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id) VALUES ($1,'reiniciar_mfa','usuario',$1)`, id)
	fmt.Println("Listo. En su próximo ingreso configurará de nuevo su app de autenticación.")
}
