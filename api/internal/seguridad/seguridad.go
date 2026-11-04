package seguridad

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ---------- Contraseñas (PBKDF2-SHA256, recomendado por OWASP) ----------

const (
	pbkdf2Iteraciones = 600000
	pbkdf2Largo       = 32
)

func HashPassword(p string) (string, error) {
	sal := make([]byte, 16)
	if _, err := rand.Read(sal); err != nil {
		return "", err
	}
	h, err := pbkdf2.Key(sha256.New, p, sal, pbkdf2Iteraciones, pbkdf2Largo)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("pbkdf2-sha256$%d$%s$%s", pbkdf2Iteraciones,
		base64.RawStdEncoding.EncodeToString(sal), base64.RawStdEncoding.EncodeToString(h)), nil
}

func VerificarPassword(p, guardado string) bool {
	partes := strings.Split(guardado, "$")
	if len(partes) != 4 || partes[0] != "pbkdf2-sha256" {
		return false
	}
	iter, err := strconv.Atoi(partes[1])
	if err != nil {
		return false
	}
	sal, err1 := base64.RawStdEncoding.DecodeString(partes[2])
	esperado, err2 := base64.RawStdEncoding.DecodeString(partes[3])
	if err1 != nil || err2 != nil {
		return false
	}
	h, err := pbkdf2.Key(sha256.New, p, sal, iter, len(esperado))
	if err != nil {
		return false
	}
	return subtle.ConstantTimeCompare(h, esperado) == 1
}

// ---------- Tokens de acceso (JWT) ----------

type Claims struct {
	Rol string `json:"rol"`
	jwt.RegisteredClaims
}

func FirmarAcceso(secreto, usuarioID, rol string, dur time.Duration) (string, error) {
	c := Claims{Rol: rol, RegisteredClaims: jwt.RegisteredClaims{
		Subject:   usuarioID,
		Issuer:    "vendigo",
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(dur)),
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString([]byte(secreto))
}

func LeerAcceso(secreto, token string) (*Claims, error) {
	c := &Claims{}
	t, err := jwt.ParseWithClaims(token, c, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("método de firma no válido")
		}
		return []byte(secreto), nil
	}, jwt.WithIssuer("vendigo"))
	if err != nil || !t.Valid {
		return nil, errors.New("token no válido")
	}
	return c, nil
}

// ---------- Valores aleatorios y hashes ----------

// TokenAleatorio devuelve un valor seguro para refresh tokens.
func TokenAleatorio() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func HashSHA256(v string) string {
	s := sha256.Sum256([]byte(v))
	return hex.EncodeToString(s[:])
}

// CodigoOTP genera un código de 6 dígitos.
func CodigoOTP() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	return fmt.Sprintf("%06d", n.Int64())
}

// HashOTP usa HMAC con el secreto del servidor para que el código no se pueda adivinar desde la base de datos.
func HashOTP(secreto, celular, codigo string) string {
	m := hmac.New(sha256.New, []byte(secreto))
	m.Write([]byte(celular + ":" + codigo))
	return hex.EncodeToString(m.Sum(nil))
}

// ---------- Cifrado de datos sensibles (AES-256-GCM) ----------

type Cifrador struct{ aead cipher.AEAD }

func NuevoCifrador(llaveBase64 string) (*Cifrador, error) {
	llave, err := base64.StdEncoding.DecodeString(llaveBase64)
	if err != nil || len(llave) != 32 {
		return nil, errors.New("ENCRYPTION_KEY debe tener 32 bytes en base64")
	}
	b, err := aes.NewCipher(llave)
	if err != nil {
		return nil, err
	}
	g, err := cipher.NewGCM(b)
	if err != nil {
		return nil, err
	}
	return &Cifrador{aead: g}, nil
}

func (c *Cifrador) Cifrar(texto string) (string, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	out := c.aead.Seal(nonce, nonce, []byte(texto), nil)
	return base64.StdEncoding.EncodeToString(out), nil
}

func (c *Cifrador) Descifrar(v string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(v)
	if err != nil || len(raw) < c.aead.NonceSize() {
		return "", errors.New("dato cifrado no válido")
	}
	n := c.aead.NonceSize()
	plano, err := c.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return "", err
	}
	return string(plano), nil
}
