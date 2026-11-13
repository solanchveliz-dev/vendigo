package admin

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Ubicación automática de sedes con OpenStreetMap (Nominatim): convierte la dirección escrita en un punto del mapa.
// Reglas del servicio público que se respetan aquí:
//   - como máximo 1 consulta por segundo para toda la aplicación (se espera 1,1 s entre consultas);
//   - cada consulta se identifica con un User-Agent propio de VendiGo;
//   - solo se consulta cuando el admin guarda una sede o toca "Ubicar automáticamente", nunca desde el comprador,
//     y el resultado se guarda para no volver a preguntar lo mismo.
// El resultado puede caer en la calle y no en el número exacto: queda marcado para que el admin lo revise.

// URLNominatim se puede cambiar en las pruebas por un servidor falso.
var URLNominatim = "https://nominatim.openstreetmap.org/search"

const agenteNominatim = "VendiGo/1.0 (proyecto de tesis Tecsup; https://github.com/solanchveliz-dev/vendigo)"

var (
	turnoNominatim  sync.Mutex
	ultimaNominatim time.Time
	clienteMapa     = &http.Client{Timeout: 10 * time.Second}
)

// ubicarDireccion devuelve la latitud y longitud de una dirección en el Perú, o nil si no la encuentra.
func ubicarDireccion(ctx context.Context, direccion, ciudad string) (*float64, *float64, error) {
	turnoNominatim.Lock()
	defer turnoNominatim.Unlock()
	if espera := time.Until(ultimaNominatim.Add(1100 * time.Millisecond)); espera > 0 {
		select {
		case <-time.After(espera):
		case <-ctx.Done():
			return nil, nil, ctx.Err()
		}
	}
	defer func() { ultimaNominatim = time.Now() }()

	q := url.Values{}
	q.Set("q", fmt.Sprintf("%s, %s, Perú", direccion, ciudad))
	q.Set("format", "jsonv2")
	q.Set("limit", "1")
	q.Set("countrycodes", "pe")
	req, err := http.NewRequestWithContext(ctx, "GET", URLNominatim+"?"+q.Encode(), nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("User-Agent", agenteNominatim)
	req.Header.Set("Accept-Language", "es")
	res, err := clienteMapa.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("openstreetmap respondió %d", res.StatusCode)
	}
	var r []struct {
		Lat string `json:"lat"`
		Lon string `json:"lon"`
	}
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil {
		return nil, nil, err
	}
	if len(r) == 0 {
		return nil, nil, nil
	}
	lat, e1 := strconv.ParseFloat(r[0].Lat, 64)
	lng, e2 := strconv.ParseFloat(r[0].Lon, 64)
	// Igual que en la base: solo se aceptan puntos dentro del Perú.
	if e1 != nil || e2 != nil || lat < -18.5 || lat > 0.1 || lng < -81.5 || lng > -68.5 {
		return nil, nil, nil
	}
	return &lat, &lng, nil
}

// ubicarSedes: "Ubicar automáticamente". Ubica las sedes activas que aún no tienen ubicación, de a pocas
// (una por segundo y como mucho 12 por clic) para no pasar el tiempo de respuesta ni el límite del servicio.
func (m *Modulo) ubicarSedes(w http.ResponseWriter, r *http.Request) error {
	ctx, cancelar := context.WithTimeout(r.Context(), 22*time.Second)
	defer cancelar()
	// ?agencia= limita a una sola agencia (opcional).
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id, direccion, ciudad, nombre FROM agencias_sedes
		WHERE activa AND lat IS NULL AND ($1 = '' OR agencia = $1) ORDER BY agencia, ciudad, nombre LIMIT 12`, r.URL.Query().Get("agencia"))
	if err != nil {
		return err
	}
	type pendiente struct{ id, direccion, ciudad, nombre string }
	var lista []pendiente
	for rows.Next() {
		var p pendiente
		if err := rows.Scan(&p.id, &p.direccion, &p.ciudad, &p.nombre); err != nil {
			rows.Close()
			return err
		}
		lista = append(lista, p)
	}
	rows.Close()

	ubicadas, sinEncontrar := 0, []string{}
	for _, p := range lista {
		lat, lng, err := ubicarDireccion(ctx, p.direccion, p.ciudad)
		if err != nil {
			break // sin conexión, servicio ocupado o se acabó el tiempo: lo que falte se ubica en otro clic
		}
		if lat == nil {
			sinEncontrar = append(sinEncontrar, p.nombre)
			continue
		}
		if _, err := m.app.DB.ExecContext(r.Context(), `UPDATE agencias_sedes SET lat=$2, lng=$3, ubicacion_auto=true WHERE id=$1`, p.id, *lat, *lng); err == nil {
			ubicadas++
		}
	}
	var faltan int
	m.app.DB.QueryRowContext(r.Context(), `SELECT count(*) FROM agencias_sedes WHERE activa AND lat IS NULL`).Scan(&faltan)
	m.app.Auditar(r.Context(), m.app.DB, adminID(r.Context()), "ubicar_agencias", "agencia", "", map[string]int{"ubicadas": ubicadas})
	httpx.OK(w, map[string]any{"ubicadas": ubicadas, "sin_encontrar": sinEncontrar, "faltan": faltan})
	return nil
}
