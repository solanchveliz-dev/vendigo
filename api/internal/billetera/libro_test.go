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
	// Venta el lunes 2/11 en la mañana; Culqi abona el miércoles 4/11 a las 4:30 p. m.
	venta := time.Date(2026, 11, 2, 10, 0, 0, 0, lima)
	abono := time.Date(2026, 11, 4, 16, 30, 0, 0, lima)
	if a := AbonoPasarela(venta); !a.Equal(abono) {
		t.Fatalf("abono: %v", a)
	}
	entrega := time.Date(2026, 11, 3, 12, 0, 0, 0, lima)
	if f := FechaLiberacion(entrega, venta, "nueva"); !f.Equal(entrega.AddDate(0, 0, 5)) {
		t.Errorf("tienda nueva: %v", f)
	}
	// Excelente o buena reputación: no antes del abono de la pasarela.
	if f := FechaLiberacion(entrega, venta, "excelente"); !f.Equal(abono) {
		t.Errorf("excelente: debe esperar el abono, salió %v", f)
	}
	if f := FechaLiberacion(entrega, venta, "buena"); !f.Equal(entrega.AddDate(0, 0, 2)) {
		t.Errorf("buena: %v", f)
	}
}

func TestDiasHabiles(t *testing.T) {
	// Venta el viernes 6/11/2026: se abona el martes 10/11 (salta sábado y domingo).
	if a := AbonoPasarela(time.Date(2026, 11, 6, 9, 0, 0, 0, lima)); a.Day() != 10 {
		t.Errorf("viernes: %v", a)
	}
	// 2026: Viernes Santo es el 3 de abril.
	if EsDiaHabil(time.Date(2026, 4, 3, 10, 0, 0, 0, lima)) {
		t.Error("Viernes Santo no es día hábil")
	}
	// Venta el lunes 7/12/2026: 8 y 9 de diciembre son feriados, se abona el viernes 11.
	if a := AbonoPasarela(time.Date(2026, 12, 7, 9, 0, 0, 0, lima)); a.Day() != 11 {
		t.Errorf("feriados de diciembre: %v", a)
	}
}
