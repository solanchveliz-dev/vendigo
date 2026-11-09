package libro

import (
	"testing"
	"time"
)

func TestVenceEn15DiasHabiles(t *testing.T) {
	lima, _ := time.LoadLocation("America/Lima")
	// Lunes 9/11/2026: 15 días hábiles después es el lunes 30/11 (sin contar fines de semana).
	v := VenceEn(time.Date(2026, 11, 9, 10, 0, 0, 0, lima))
	if v.Month() != 11 || v.Day() != 30 {
		t.Errorf("esperaba 30/11, salió %v", v)
	}
	// Con feriados: desde el lunes 30/11, el 8/12 y el 9/12 no cuentan → 23/12.
	v = VenceEn(time.Date(2026, 11, 30, 10, 0, 0, 0, lima))
	if v.Month() != 12 || v.Day() != 23 {
		t.Errorf("esperaba 23/12, salió %v", v)
	}
}
