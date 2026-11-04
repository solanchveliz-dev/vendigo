package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Entorno     string
	Puerto      string
	DatabaseURL string
	WebURL      string

	JWTSecreto     string
	AccesoDuracion time.Duration
	RefreshDias    int

	// Llave de 32 bytes en base64 para cifrar DNI y cuentas bancarias (en AWS viene de KMS / Secrets Manager).
	LlaveCifrado string

	S3Region       string
	S3Endpoint     string // vacío en AWS; http://localhost:9000 con MinIO
	S3AccessKey    string
	S3SecretKey    string
	BucketPublico  string
	BucketPrivado  string
	MediaPublicURL string // CloudFront o MinIO

	OTPCanal string // log (pruebas) o sms (Amazon SNS)

	IAProveedor string // simulado (sin costo) o bedrock
	IAModelo    string
	IARegion    string
}

func (c Config) EsDev() bool { return c.Entorno == "dev" }

// Carga lee las variables de entorno. Si existe un archivo .env lo usa como base.
func Carga() Config {
	cargarArchivo(".env")
	return Config{
		Entorno:        env("APP_ENV", "dev"),
		Puerto:         env("PORT", "8080"),
		DatabaseURL:    env("DATABASE_URL", "postgres://vendigo:vendigo@localhost:5432/vendigo?sslmode=disable"),
		WebURL:         env("WEB_URL", "http://localhost:3000"),
		JWTSecreto:     env("JWT_SECRET", "cambia-este-secreto-en-produccion"),
		AccesoDuracion: time.Duration(envInt("JWT_ACCESS_MIN", 15)) * time.Minute,
		RefreshDias:    envInt("JWT_REFRESH_DIAS", 30),
		LlaveCifrado:   env("ENCRYPTION_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="),
		S3Region:       env("S3_REGION", "us-east-1"),
		S3Endpoint:     env("S3_ENDPOINT", ""),
		S3AccessKey:    env("S3_ACCESS_KEY", ""),
		S3SecretKey:    env("S3_SECRET_KEY", ""),
		BucketPublico:  env("S3_BUCKET_PUBLICO", "vendigo-publico"),
		BucketPrivado:  env("S3_BUCKET_PRIVADO", "vendigo-privado"),
		MediaPublicURL: strings.TrimRight(env("MEDIA_PUBLIC_URL", "http://localhost:9000/vendigo-publico"), "/"),
		OTPCanal:       env("OTP_CANAL", "log"),
		IAProveedor:    env("IA_PROVEEDOR", "simulado"),
		IAModelo:       env("IA_MODELO", "amazon.nova-lite-v1:0"),
		IARegion:       env("IA_REGION", "us-east-1"),
	}
}

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

func envInt(k string, def int) int {
	if n, err := strconv.Atoi(env(k, "")); err == nil {
		return n
	}
	return def
}

func cargarArchivo(ruta string) {
	f, err := os.Open(ruta)
	if err != nil {
		return
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		l := strings.TrimSpace(s.Text())
		if l == "" || strings.HasPrefix(l, "#") {
			continue
		}
		k, v, ok := strings.Cut(l, "=")
		if !ok {
			continue
		}
		k = strings.TrimSpace(k)
		if _, existe := os.LookupEnv(k); !existe {
			os.Setenv(k, strings.Trim(strings.TrimSpace(v), `"`))
		}
	}
}
