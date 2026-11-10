package billetera

import (
	"testing"
	"time"
)

func TestDiasHabiles(t *testing.T) {
	// 2026: Viernes Santo es el 3 de abril.
	if EsDiaHabil(time.Date(2026, 4, 3, 10, 0, 0, 0, lima)) {
		t.Error("Viernes Santo no es día hábil")
	}
	if EsDiaHabil(time.Date(2026, 12, 8, 10, 0, 0, 0, lima)) || EsDiaHabil(time.Date(2026, 12, 9, 10, 0, 0, 0, lima)) {
		t.Error("8 y 9 de diciembre son feriados")
	}
	if EsDiaHabil(time.Date(2026, 11, 7, 10, 0, 0, 0, lima)) {
		t.Error("el sábado no es día hábil")
	}
	if !EsDiaHabil(time.Date(2026, 11, 9, 10, 0, 0, 0, lima)) {
		t.Error("el lunes 9/11 sí es día hábil")
	}
}
