package seguridad

import "unicode"

// ValidarPassword aplica la regla de contraseñas de VendiGo:
// entre 8 y 64 caracteres, con al menos una mayúscula, una minúscula y un número.
// Devuelve el mensaje para la persona, o "" si la contraseña cumple.
func ValidarPassword(p string) string {
	n := len([]rune(p))
	if n < 8 {
		return "La contraseña debe tener al menos 8 caracteres."
	}
	if n > 64 {
		return "La contraseña puede tener hasta 64 caracteres."
	}
	var may, min, num bool
	for _, c := range p {
		switch {
		case unicode.IsUpper(c):
			may = true
		case unicode.IsLower(c):
			min = true
		case unicode.IsDigit(c):
			num = true
		}
	}
	if !may || !min || !num {
		return "La contraseña debe tener al menos una mayúscula, una minúscula y un número."
	}
	return ""
}
