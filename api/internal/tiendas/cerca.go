package tiendas

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
)

// Agencias reales cerca del comprador, buscadas en vivo en OpenStreetMap: primero con su buscador (Nominatim),
// que responde en menos de un segundo, y si no responde con Overpass. Ambos son gratuitos y sin clave.
// Shalom, Olva y Marvisur no tienen una API pública: OpenStreetMap es un mapa abierto que mantiene la comunidad,
// así que puede no tener todas las agencias. Por eso el checkout ofrece además abrir Google Maps (enlace, sin costo).
//
// Reglas del servicio que se respetan:
//   - menos de 100 consultas al día para toda VendiGo (las de todos los compradores suman);
//   - cada consulta se identifica con un User-Agent propio;
//   - lo encontrado en una zona se guarda 24 horas, así otro comprador cerca no genera otra consulta;
//   - como mucho una consulta por segundo.
// Privacidad: la ubicación del comprador se redondea (~1 km) antes de usarla y no se guarda en la base de datos.

// URLBuscador (Nominatim) y URLOverpass se pueden cambiar en las pruebas por un servidor falso.
var URLBuscador = "https://nominatim.openstreetmap.org/search"

var URLOverpass = "https://overpass-api.de/api/interpreter"

// Servidores públicos de respaldo, por si el principal está saturado (se prueban en orden, uno por vez).
var OverpassRespaldo = []string{"https://overpass.private.coffee/api/interpreter"}

const (
	agenteOverpass = "VendiGo/1.0 (proyecto de tesis Tecsup; https://github.com/solanchveliz-dev/vendigo)"
	topeDiario     = 100
	radioMetros    = 8000
)

// AgenciaCerca: una agencia encontrada en OpenStreetMap.
type AgenciaCerca struct {
	Nombre    string  `json:"nombre"`
	Direccion string  `json:"direccion"`
	Ciudad    string  `json:"ciudad"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Km        float64 `json:"km"`
}

type guardado struct {
	lista []AgenciaCerca
	hasta time.Time
}

var cerca = struct {
	sync.Mutex
	cache  map[string]guardado
	dia    string
	usadas int
	ultima time.Time
}{cache: map[string]guardado{}}

var clienteOverpass = &http.Client{Timeout: 9 * time.Second} // dos intentos caben en los 20 s que espera la web

// Palabra que identifica a cada agencia en los nombres del mapa ("Olva Courier" → "olva").
var marcas = map[string]string{"Shalom": "shalom", "Olva Courier": "olva", "Marvisur": "marvisur", "Flores": "flores"}

// Lugares con el mismo nombre que no son agencias de envío (una iglesia "Shalom", un colegio "Shalom"…).
var noSonAgencias = map[string]bool{
	"place_of_worship": true, "school": true, "kindergarten": true, "college": true, "university": true,
	"restaurant": true, "cafe": true, "fast_food": true, "clinic": true, "hospital": true, "doctors": true,
	"pharmacy": true, "dentist": true, "bar": true, "pub": true, "hotel": true, "guest_house": true,
}

// agenciasCerca: GET /agencias/cerca?agencia=Shalom&lat=-12.07&lng=-77.04
func (m *Modulo) agenciasCerca(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	marca, ok := marcas[q.Get("agencia")]
	if !ok {
		return httpx.Invalido("Esa agencia no se puede buscar en el mapa.")
	}
	lat, e1 := strconv.ParseFloat(q.Get("lat"), 64)
	lng, e2 := strconv.ParseFloat(q.Get("lng"), 64)
	if e1 != nil || e2 != nil || lat < -18.5 || lat > 0.1 || lng < -81.5 || lng > -68.5 {
		return httpx.Invalido("La búsqueda de agencias cercanas funciona dentro del Perú.")
	}
	// Redondeo a 2 decimales (~1 km): suficiente para buscar en 8 km y no se usa la ubicación exacta.
	lat, lng = math.Round(lat*100)/100, math.Round(lng*100)/100
	lista, disponible, err := buscarCerca(r.Context(), marca, lat, lng)
	motivo := ""
	if err != nil {
		// El mapa no respondió: el checkout ofrece Google Maps y escribir la sede. Queda en el registro de la API.
		slog.Warn("agencias cercanas: openstreetmap no respondió", "err", err)
		disponible, motivo, lista = false, "sin_respuesta", []AgenciaCerca{}
	} else if !disponible {
		motivo = "tope_diario"
	}
	httpx.OK(w, map[string]any{"agencias": lista, "disponible": disponible, "motivo": motivo, "fuente": "© OpenStreetMap"})
	return nil
}

func buscarCerca(ctx context.Context, marca string, lat, lng float64) ([]AgenciaCerca, bool, error) {
	clave := fmt.Sprintf("%s|%.2f|%.2f", marca, lat, lng)
	cerca.Lock()
	defer cerca.Unlock()
	if g, ok := cerca.cache[clave]; ok && time.Now().Before(g.hasta) {
		return g.lista, true, nil
	}
	hoy := time.Now().Format("2006-01-02")
	if cerca.dia != hoy {
		cerca.dia, cerca.usadas = hoy, 0
	}
	if cerca.usadas >= topeDiario {
		return []AgenciaCerca{}, false, nil
	}
	if espera := time.Until(cerca.ultima.Add(time.Second)); espera > 0 {
		time.Sleep(espera)
	}
	cerca.usadas++
	cerca.ultima = time.Now()

	d, err := consultarBuscador(ctx, marca, lat, lng)
	if err != nil {
		consulta := fmt.Sprintf(`[out:json][timeout:8];nwr["name"~"%s",i](%f,%f,%f,%f);out center 40;`,
			marca, lat-0.07, lng-0.07, lat+0.07, lng+0.07)
		for _, servidor := range append([]string{URLOverpass}, OverpassRespaldo...) {
			if d, err = consultarOverpass(ctx, servidor, consulta); err == nil {
				break
			}
		}
	}
	if err != nil {
		return nil, false, err
	}
	lista := []AgenciaCerca{}
	vistos := map[string]bool{}
	for _, e := range d.Elements {
		t := e.Tags
		if noSonAgencias[t["amenity"]] || t["leisure"] != "" || t["tourism"] != "" {
			continue
		}
		la, lo := e.Lat, e.Lon
		if e.Center != nil {
			la, lo = e.Center.Lat, e.Center.Lon
		}
		if la == 0 && lo == 0 {
			continue
		}
		nombre := strings.TrimSpace(t["name"])
		if nombre == "" {
			nombre = t["brand"]
		}
		// El nombre tiene que ser de la agencia (no una calle "Pasaje Shalom" ni un lugar cuya dirección la menciona).
		if !strings.Contains(strings.ToLower(nombre), marca) || t["highway"] != "" || t["place"] != "" || t["boundary"] != "" {
			continue
		}
		calle := strings.TrimSpace(strings.TrimSpace(t["addr:street"]) + " " + t["addr:housenumber"])
		zona := firstNonEmpty(t["addr:district"], t["addr:suburb"], t["addr:subdistrict"])
		ciudad := firstNonEmpty(t["addr:city"], t["addr:province"], t["addr:state"])
		direccion := strings.Trim(strings.Join(noVacios(calle, zona), ", "), ", ")
		if direccion == "" {
			direccion = "Dirección no registrada en el mapa"
		}
		clave := fmt.Sprintf("%.4f|%.4f", la, lo)
		if vistos[clave] {
			continue
		}
		vistos[clave] = true
		lista = append(lista, AgenciaCerca{Nombre: nombre, Direccion: direccion, Ciudad: ciudad, Lat: la, Lng: lo, Km: distanciaKm(lat, lng, la, lo)})
	}
	sort.Slice(lista, func(i, j int) bool { return lista[i].Km < lista[j].Km })
	if len(lista) > 8 {
		lista = lista[:8]
	}
	if len(cerca.cache) > 2000 { // memoria acotada: se vacía y se vuelve a llenar
		cerca.cache = map[string]guardado{}
	}
	cerca.cache[clave] = guardado{lista: lista, hasta: time.Now().Add(24 * time.Hour)}
	return lista, true, nil
}

type respuestaOverpass struct {
	Elements []struct {
		Lat    float64                     `json:"lat"`
		Lon    float64                     `json:"lon"`
		Center *struct{ Lat, Lon float64 } `json:"center"`
		Tags   map[string]string           `json:"tags"`
	} `json:"elements"`
}

// consultarBuscador: Nominatim busca el nombre dentro de un recuadro de ~8 km alrededor del comprador
// (con índice, por eso es rápido). La respuesta se pasa al mismo formato que Overpass.
func consultarBuscador(ctx context.Context, marca string, lat, lng float64) (respuestaOverpass, error) {
	var d respuestaOverpass
	q := url.Values{}
	q.Set("q", marca)
	q.Set("format", "jsonv2")
	q.Set("addressdetails", "1")
	q.Set("extratags", "1")
	q.Set("limit", "30")
	q.Set("countrycodes", "pe")
	q.Set("bounded", "1")
	q.Set("viewbox", fmt.Sprintf("%f,%f,%f,%f", lng-0.08, lat+0.08, lng+0.08, lat-0.08))
	req, err := http.NewRequestWithContext(ctx, "GET", URLBuscador+"?"+q.Encode(), nil)
	if err != nil {
		return d, err
	}
	req.Header.Set("User-Agent", agenteOverpass)
	req.Header.Set("Accept-Language", "es")
	res, err := clienteOverpass.Do(req)
	if err != nil {
		return d, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return d, fmt.Errorf("nominatim respondió %d", res.StatusCode)
	}
	var lugares []struct {
		Lat      string            `json:"lat"`
		Lon      string            `json:"lon"`
		Name     string            `json:"name"`
		Category string            `json:"category"`
		Type     string            `json:"type"`
		Address  map[string]string `json:"address"`
	}
	if err := json.NewDecoder(res.Body).Decode(&lugares); err != nil {
		return d, err
	}
	for _, l := range lugares {
		la, e1 := strconv.ParseFloat(l.Lat, 64)
		lo, e2 := strconv.ParseFloat(l.Lon, 64)
		if e1 != nil || e2 != nil {
			continue
		}
		a := l.Address
		tags := map[string]string{
			"name": l.Name, l.Category: l.Type,
			"addr:street": a["road"], "addr:housenumber": a["house_number"],
			"addr:district": firstNonEmpty(a["suburb"], a["city_district"], a["neighbourhood"]),
			"addr:city":     firstNonEmpty(a["city"], a["town"], a["state"]),
		}
		e := d.Elements
		e = append(e, struct {
			Lat    float64                     `json:"lat"`
			Lon    float64                     `json:"lon"`
			Center *struct{ Lat, Lon float64 } `json:"center"`
			Tags   map[string]string           `json:"tags"`
		}{Lat: la, Lon: lo, Tags: tags})
		d.Elements = e
	}
	return d, nil
}

func consultarOverpass(ctx context.Context, servidor, consulta string) (respuestaOverpass, error) {
	var d respuestaOverpass
	req, err := http.NewRequestWithContext(ctx, "POST", servidor, strings.NewReader("data="+url.QueryEscape(consulta)))
	if err != nil {
		return d, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", agenteOverpass)
	res, err := clienteOverpass.Do(req)
	if err != nil {
		return d, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return d, fmt.Errorf("%s respondió %d", servidor, res.StatusCode)
	}
	err = json.NewDecoder(res.Body).Decode(&d)
	return d, err
}

func firstNonEmpty(v ...string) string {
	for _, s := range v {
		if s = strings.TrimSpace(s); s != "" {
			return s
		}
	}
	return ""
}

func noVacios(v ...string) []string {
	out := []string{}
	for _, s := range v {
		if strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

// distanciaKm: fórmula de Haversine.
func distanciaKm(la1, lo1, la2, lo2 float64) float64 {
	rad := func(g float64) float64 { return g * math.Pi / 180 }
	h := math.Pow(math.Sin(rad(la2-la1)/2), 2) + math.Cos(rad(la1))*math.Cos(rad(la2))*math.Pow(math.Sin(rad(lo2-lo1)/2), 2)
	return math.Round(6371*2*math.Asin(math.Sqrt(h))*10) / 10
}
