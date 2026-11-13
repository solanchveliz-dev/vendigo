package compras

import (
	"context"
	"database/sql"
	"slices"
	"time"

	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Hora del Perú (sin horario de verano): "hoy" y los días de atención se cuentan en Lima.
var horaPeru = time.FixedZone("PET", -5*60*60)

// DiasParaRecoger: cuántos días hacia adelante se puede reservar el recojo (hoy incluido).
const DiasParaRecoger = 14

// validarDiaRecojo: en "Recojo en tienda" el cliente elige qué día pasará, como una reserva.
// Debe ser desde hoy y dentro de las próximas dos semanas, y un día que la tienda atiende
// (si la tienda no marcó días, se acepta cualquiera).
func (m *Modulo) validarDiaRecojo(ctx context.Context, tiendaID, dia string, ahora time.Time) error {
	return ValidarDiaRecojo(ctx, m.app.DB, tiendaID, dia, ahora)
}

// ValidarDiaRecojo es la regla de arriba, aparte para poder probarla con cualquier "hoy".
func ValidarDiaRecojo(ctx context.Context, db *sql.DB, tiendaID, dia string, ahora time.Time) error {
	if dia == "" {
		return httpx.Invalido("Elige qué día irás a recoger tu pedido.")
	}
	d, err := time.ParseInLocation("2006-01-02", dia, horaPeru)
	if err != nil {
		return httpx.Invalido("El día de recojo no es válido.")
	}
	hoy := ahora.In(horaPeru)
	inicio := time.Date(hoy.Year(), hoy.Month(), hoy.Day(), 0, 0, 0, 0, horaPeru)
	if d.Before(inicio) || !d.Before(inicio.AddDate(0, 0, DiasParaRecoger)) {
		return httpx.Invalido("Elige un día entre hoy y las próximas dos semanas.")
	}
	var dias []int64
	if err := db.QueryRowContext(ctx, `SELECT dias_recojo FROM tiendas WHERE id=$1`, tiendaID).Scan(pq.Array(&dias)); err != nil {
		return err
	}
	if len(dias) > 0 && !slices.Contains(dias, int64(d.Weekday())) {
		return httpx.Invalido("La tienda no atiende recojos ese día. Elige otro.")
	}
	return nil
}
