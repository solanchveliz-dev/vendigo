package billetera

import "time"

// La pasarela (Culqi) abona a VendiGo las ventas online a los 2 días hábiles, entre 2:00 y 4:30 p. m.
// (una venta del lunes se abona el miércoles). El dinero nunca se libera a la tienda antes de esa fecha,
// así VendiGo no adelanta plata que todavía no recibió.

const diasHabilesAbono = 2

var lima = func() *time.Location {
	l, err := time.LoadLocation("America/Lima")
	if err != nil {
		return time.FixedZone("PET", -5*3600)
	}
	return l
}()

// AbonoPasarela devuelve el momento en que la pasarela abona una venta (16:30 del 2.º día hábil).
func AbonoPasarela(venta time.Time) time.Time {
	d := venta.In(lima)
	d = time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, lima)
	for n := 0; n < diasHabilesAbono; {
		d = d.AddDate(0, 0, 1)
		if EsDiaHabil(d) {
			n++
		}
	}
	return time.Date(d.Year(), d.Month(), d.Day(), 16, 30, 0, 0, lima)
}

// EsDiaHabil: de lunes a viernes y que no sea feriado nacional del Perú.
func EsDiaHabil(d time.Time) bool {
	d = d.In(lima)
	if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
		return false
	}
	return !esFeriado(d)
}

func esFeriado(d time.Time) bool {
	fijos := map[[2]int]bool{
		{1, 1}: true, {5, 1}: true, {6, 7}: true, {6, 29}: true, {7, 23}: true, {7, 28}: true, {7, 29}: true,
		{8, 6}: true, {8, 30}: true, {10, 8}: true, {11, 1}: true, {12, 8}: true, {12, 9}: true, {12, 25}: true,
	}
	if fijos[[2]int{int(d.Month()), d.Day()}] {
		return true
	}
	// Jueves y Viernes Santo.
	p := pascua(d.Year())
	jueves, viernes := p.AddDate(0, 0, -3), p.AddDate(0, 0, -2)
	return mismoDia(d, jueves) || mismoDia(d, viernes)
}

func mismoDia(a, b time.Time) bool {
	return a.Year() == b.Year() && a.Month() == b.Month() && a.Day() == b.Day()
}

// pascua calcula el domingo de Pascua (algoritmo de Meeus/Jones/Butcher).
func pascua(y int) time.Time {
	a, b, c := y%19, y/100, y%100
	d, e := b/4, b%4
	f := (b + 8) / 25
	g := (b - f + 1) / 3
	h := (19*a + b - d - g + 15) % 30
	i, k := c/4, c%4
	l := (32 + 2*e + 2*i - h - k) % 7
	m := (a + 11*h + 22*l) / 451
	mes := (h + l - 7*m + 114) / 31
	dia := (h+l-7*m+114)%31 + 1
	return time.Date(y, time.Month(mes), dia, 0, 0, 0, 0, lima)
}
