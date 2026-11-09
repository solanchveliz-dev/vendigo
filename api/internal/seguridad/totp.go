package seguridad

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// TOTP (RFC 6238): el mismo estándar que usan Google Authenticator, Microsoft Authenticator,
// GitHub o AWS. Códigos de 6 dígitos que cambian cada 30 segundos.

const (
	totpPaso    = 30
	totpDigitos = 6
)

var b32 = base32.StdEncoding.WithPadding(base32.NoPadding)

// NuevoSecretoTOTP genera un secreto aleatorio de 160 bits en base32.
func NuevoSecretoTOTP() string {
	b := make([]byte, 20)
	rand.Read(b)
	return b32.EncodeToString(b)
}

// URLTOTP es el contenido del código QR que se escanea con la app.
func URLTOTP(emisor, cuenta, secreto string) string {
	etiqueta := url.PathEscape(emisor + ":" + cuenta)
	q := url.Values{"secret": {secreto}, "issuer": {emisor}, "algorithm": {"SHA1"}, "digits": {"6"}, "period": {"30"}}
	return "otpauth://totp/" + etiqueta + "?" + q.Encode()
}

func codigoTOTP(secreto []byte, paso int64) string {
	var msg [8]byte
	binary.BigEndian.PutUint64(msg[:], uint64(paso))
	h := hmac.New(sha1.New, secreto)
	h.Write(msg[:])
	sum := h.Sum(nil)
	o := sum[len(sum)-1] & 0x0f
	n := binary.BigEndian.Uint32(sum[o:o+4]) & 0x7fffffff
	return fmt.Sprintf("%0*d", totpDigitos, n%1_000_000)
}

// VerificarTOTP acepta el código del paso actual o de uno antes/después (relojes desfasados).
// Devuelve el paso usado, para impedir que el mismo código se use dos veces.
func VerificarTOTP(secreto, codigo string, ahora time.Time) (int64, bool) {
	clave, err := b32.DecodeString(strings.ToUpper(strings.TrimSpace(secreto)))
	if err != nil || len(codigo) != totpDigitos {
		return 0, false
	}
	actual := ahora.Unix() / totpPaso
	for d := int64(-1); d <= 1; d++ {
		if subtle.ConstantTimeCompare([]byte(codigoTOTP(clave, actual+d)), []byte(codigo)) == 1 {
			return actual + d, true
		}
	}
	return 0, false
}

// CodigosRespaldo genera códigos de un solo uso por si se pierde el celular (formato XXXXX-XXXXX).
func CodigosRespaldo(n int) []string {
	const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	out := make([]string, n)
	for i := range out {
		b := make([]byte, 10)
		rand.Read(b)
		for j := range b {
			b[j] = letras[int(b[j])%len(letras)]
		}
		out[i] = string(b[:5]) + "-" + string(b[5:])
	}
	return out
}
