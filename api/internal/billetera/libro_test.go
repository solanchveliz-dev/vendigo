package billetera

import (
	"testing"
	"time"
)

func TestComisionPasarela(t *testing.T) {
	casos := map[int]int{3000: 350, 8771: 350, 10000: 413, 50000: 1789}
	for total, esperado := range casos {
		if c := ComisionPasarela(total); c != esperado {
			t.Errorf("comisión de %d: esperado %d, obtenido %d", total, esperado, c)
		}
	}
}

func TestFechaLiberacion(t *testing.T) {
	base := time.Date(2026, 11, 3, 12, 0, 0, 0, time.UTC)
	if d := FechaLiberacion(base, "nueva").Sub(base); d != 5*24*time.Hour {
		t.Errorf("tienda nueva: %v", d)
	}
	if d := FechaLiberacion(base, "buena").Sub(base); d != 2*24*time.Hour {
		t.Errorf("buena reputación: %v", d)
	}
	if !FechaLiberacion(base, "excelente").Equal(base) {
		t.Error("reputación excelente: debe liberarse al instante")
	}
}
