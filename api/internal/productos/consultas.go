package productos

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"unicode"

	"github.com/go-chi/chi/v5"
	"github.com/lib/pq"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// ---------- información de la tienda (para respuestas rápidas y automáticas) ----------

type infoTienda struct {
	Horario, Direccion, Zonas, Politicas, Otra, Ciudad string
	Recojo, Agencia, Moto, OtraActiva                  bool
	Agencias                                           []string
	CostoMoto                                          int
}

func leerInfo(ctx context.Context, q core.Ejecutor, tid string) (infoTienda, error) {
	var t infoTienda
	err := q.QueryRowContext(ctx, `SELECT COALESCE(NULLIF(horario,''), horario_recojo), direccion_recojo, zonas_motorizado, politicas, descripcion_otra, ciudad,
		entrega_recojo, entrega_agencia, entrega_motorizado, entrega_otra, agencias, costo_motorizado_centimos
		FROM tiendas WHERE id=$1`, tid).Scan(&t.Horario, &t.Direccion, &t.Zonas, &t.Politicas, &t.Otra, &t.Ciudad,
		&t.Recojo, &t.Agencia, &t.Moto, &t.OtraActiva, pq.Array(&t.Agencias), &t.CostoMoto)
	return t, err
}

func minuscula(s string) string {
	if s == "" {
		return s
	}
	r := []rune(s)
	r[0] = unicode.ToLower(r[0])
	return string(r)
}

// textoEnvios arma una frase con las formas de entrega que la tienda tiene activas.
func (t infoTienda) textoEnvios() string {
	partes := []string{}
	if t.Agencia {
		ag := "agencia"
		if len(t.Agencias) > 0 {
			ag = strings.Join(t.Agencias, ", ")
		}
		partes = append(partes, "enviamos a todo el Perú por "+ag)
	}
	if t.Moto {
		m := "tenemos delivery con motorizado"
		if t.Zonas != "" {
			m += " en " + t.Zonas
		}
		if t.CostoMoto > 0 {
			m += fmt.Sprintf(" desde S/ %.2f", float64(t.CostoMoto)/100)
		}
		partes = append(partes, m)
	}
	if t.Recojo && t.Direccion != "" {
		partes = append(partes, "puedes recoger en "+t.Direccion)
	}
	if t.OtraActiva && t.Otra != "" {
		partes = append(partes, minuscula(t.Otra))
	}
	if len(partes) == 0 {
		return ""
	}
	txt := strings.Join(partes, "; ")
	return strings.ToUpper(txt[:1]) + txt[1:] + "."
}

// ---------- nueva pregunta (la usan el comprador y la demo) ----------

// NuevaPregunta guarda la pregunta de un comprador. Si la tienda tiene activas las respuestas
// automáticas y la respuesta está en su información, se responde sola (sin IA). Si no, avisa a la tienda.
func NuevaPregunta(ctx context.Context, app *core.App, productoID, autor, texto string) error {
	texto = strings.TrimSpace(texto)
	if n := len([]rune(texto)); n < 3 || n > 300 {
		return httpx.Invalido("La pregunta debe tener entre 3 y 300 caracteres.")
	}
	return app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		var tid, nombre string
		var auto bool
		err := tx.QueryRowContext(ctx, `SELECT t.id, p.nombre, t.respuestas_automaticas FROM productos p JOIN tiendas t ON t.id=p.tienda_id
			WHERE p.id::text=$1 AND NOT p.eliminado`, productoID).Scan(&tid, &nombre, &auto)
		if core.SinFilas(err) {
			return httpx.ErrNoEncontrado
		}
		if err != nil {
			return err
		}
		respuesta := ""
		if auto {
			respuesta = respuestaAutomatica(ctx, tx, tid, productoID, texto)
		}
		if respuesta != "" {
			_, err = tx.ExecContext(ctx, `INSERT INTO preguntas (producto_id, autor_nombre, pregunta, respuesta, respondida_en, automatica)
				VALUES ($1,$2,$3,$4,now(),true)`, productoID, autor, texto, respuesta)
			return err
		}
		if _, err = tx.ExecContext(ctx, `INSERT INTO preguntas (producto_id, autor_nombre, pregunta) VALUES ($1,$2,$3)`, productoID, autor, texto); err != nil {
			return err
		}
		primero := strings.Fields(autor + " Cliente")[0]
		billetera.Notificar(ctx, tx, tid, "Nueva pregunta en "+nombre, fmt.Sprintf("%s pregunta: “%s”", primero, texto), "/vendedor/consultas")
		return nil
	})
}

var (
	reHorario  = regexp.MustCompile(`horario|a que hora|hasta que hora|atienden|abren|cierran`)
	reEnvio    = regexp.MustCompile(`envi|envio|agencia|shalom|olva|delivery|provincia|motorizado|entrega|llega|demora|recoj|recog|despach`)
	rePolitica = regexp.MustCompile(`cambio|devol|garant|reembols`)
	rePrecio   = regexp.MustCompile(`precio|cuanto cuesta|cuanto esta|cuanto vale|cuesta|costo`)
	reStock    = regexp.MustCompile(`stock|disponib|quedan|agotad|todavia hay|aun hay|hay unidades`)
	reOpcion   = regexp.MustCompile(`color|colores|talla|tallas|modelo|modelos|opcion|opciones|tono|tonos`)
)

var sinTilde = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u")

func normalizar(s string) string {
	s = sinTilde.Replace(strings.ToLower(s))
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		} else {
			b.WriteRune(' ')
		}
	}
	return " " + strings.Join(strings.Fields(b.String()), " ") + " "
}

// respuestaAutomatica responde solo con datos que la tienda ya escribió. Si no está seguro, devuelve "".
func respuestaAutomatica(ctx context.Context, q core.Ejecutor, tid, productoID, pregunta string) string {
	t := normalizar(pregunta)
	info, err := leerInfo(ctx, q, tid)
	if err != nil {
		return ""
	}
	switch {
	case reHorario.MatchString(t):
		if info.Horario != "" {
			return "Nuestro horario de atención: " + strings.TrimSuffix(info.Horario, ".") + "."
		}
		return ""
	case rePolitica.MatchString(t):
		return info.Politicas
	case reEnvio.MatchString(t):
		return info.textoEnvios()
	}

	var nombre string
	var precio, stock, pct int
	var detalles []byte
	var vars []string
	if q.QueryRowContext(ctx, `SELECT nombre, precio_centimos, stock, detalles,
		COALESCE((SELECT array_agg(nombre ORDER BY orden) FROM producto_variantes WHERE producto_id=p.id AND stock>0), '{}'),
		COALESCE((SELECT descuento_pct FROM ofertas o WHERE o.producto_id=p.id AND o.termina_en > now()), 0)
		FROM productos p WHERE id::text=$1`, productoID).Scan(&nombre, &precio, &stock, &detalles, pq.Array(&vars), &pct) != nil {
		return ""
	}
	switch {
	case rePrecio.MatchString(t):
		if pct > 0 {
			return fmt.Sprintf("%s cuesta S/ %.2f con %d %% de descuento por tiempo limitado (antes S/ %.2f).", nombre, float64(PrecioConOferta(precio, pct))/100, pct, float64(precio)/100)
		}
		return fmt.Sprintf("%s cuesta S/ %.2f.", nombre, float64(precio)/100)
	case reStock.MatchString(t) || reOpcion.MatchString(t):
		if stock == 0 {
			return fmt.Sprintf("Por ahora “%s” está agotado.", nombre)
		}
		var det struct {
			Colores [][]string `json:"colores"`
		}
		json.Unmarshal(detalles, &det)
		opciones := vars
		if len(opciones) == 0 {
			for _, c := range det.Colores {
				if len(c) > 0 {
					opciones = append(opciones, c[0])
				}
			}
		}
		// Si pregunta por una opción concreta, solo confirmamos si está en la lista.
		for _, o := range opciones {
			if strings.Contains(t, normalizar(o)) {
				return fmt.Sprintf("Sí, tenemos “%s” en %s.", nombre, minuscula(o))
			}
		}
		if len(opciones) > 0 {
			return fmt.Sprintf("Sí, “%s” está disponible. Lo tenemos en: %s.", nombre, strings.Join(opciones, ", "))
		}
		// Pregunta por colores o tallas y el producto no tiene opciones: que responda la tienda.
		if reOpcion.MatchString(t) {
			return ""
		}
		return fmt.Sprintf("Sí, “%s” está disponible.", nombre)
	}
	return ""
}

// ---------- respuestas automáticas: interruptor ----------

func (m *Modulo) leerAutomaticas(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var activo bool
	var auto int
	m.app.DB.QueryRowContext(ctx, `SELECT respuestas_automaticas FROM tiendas WHERE id=$1`, tid).Scan(&activo)
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM preguntas q JOIN productos p ON p.id=q.producto_id WHERE p.tienda_id=$1 AND q.automatica`, tid).Scan(&auto)
	info, _ := leerInfo(ctx, m.app.DB, tid)
	httpx.OK(w, map[string]any{"activo": activo, "respondidas": auto, "horario": info.Horario, "envios": info.textoEnvios(), "politicas": info.Politicas})
	return nil
}

func (m *Modulo) cambiarAutomaticas(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Activo bool `json:"activo"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if _, err := m.app.DB.ExecContext(ctx, `UPDATE tiendas SET respuestas_automaticas=$2 WHERE id=$1`, tid, in.Activo); err != nil {
		return err
	}
	return m.leerAutomaticas(w, r)
}

// ---------- respuestas rápidas (mensajes guardados, sin IA) ----------

type RespuestaRapida struct {
	ID     string `json:"id"`
	Titulo string `json:"titulo"`
	Texto  string `json:"texto"`
	Auto   bool   `json:"auto"`
}

// crearIniciales arma las primeras respuestas con la información de la tienda (una sola vez).
func crearIniciales(ctx context.Context, tx *sql.Tx, tid string) error {
	var creadas bool
	if err := tx.QueryRowContext(ctx, `SELECT respuestas_creadas FROM tiendas WHERE id=$1 FOR UPDATE`, tid).Scan(&creadas); err != nil || creadas {
		return err
	}
	info, err := leerInfo(ctx, tx, tid)
	if err != nil {
		return err
	}
	ini := [][2]string{{"Disponibilidad", "Sí, tenemos disponibilidad. ¿Qué opción te interesa?"}}
	if info.Horario != "" {
		ini = append(ini, [2]string{"Horario", "Nuestro horario de atención: " + strings.TrimSuffix(info.Horario, ".") + "."})
	}
	if e := info.textoEnvios(); e != "" {
		ini = append(ini, [2]string{"Envíos", e})
	}
	if info.Recojo && info.Direccion != "" {
		ini = append(ini, [2]string{"Recojo", "Puedes recoger en " + info.Direccion + ". Al llegar, muestra tu código de recojo."})
	}
	for i, x := range ini {
		if _, err := tx.ExecContext(ctx, `INSERT INTO respuestas_rapidas (tienda_id, titulo, texto, auto, creado_en) VALUES ($1,$2,$3,true, now() + $4 * interval '1 millisecond')`,
			tid, x[0], x[1], i); err != nil {
			return err
		}
	}
	_, err = tx.ExecContext(ctx, `UPDATE tiendas SET respuestas_creadas=true WHERE id=$1`, tid)
	return err
}

func (m *Modulo) listarRapidas(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	if err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error { return crearIniciales(ctx, tx, tid) }); err != nil {
		return err
	}
	rows, err := m.app.DB.QueryContext(ctx, `SELECT id, titulo, texto, auto FROM respuestas_rapidas WHERE tienda_id=$1 ORDER BY creado_en`, tid)
	if err != nil {
		return err
	}
	defer rows.Close()
	out := []RespuestaRapida{}
	for rows.Next() {
		var x RespuestaRapida
		rows.Scan(&x.ID, &x.Titulo, &x.Texto, &x.Auto)
		out = append(out, x)
	}
	httpx.OK(w, map[string]any{"respuestas": out})
	return nil
}

func leerRapida(r *http.Request) (RespuestaRapida, error) {
	var in RespuestaRapida
	if err := httpx.Leer(r, &in); err != nil {
		return in, err
	}
	in.Titulo, in.Texto = strings.TrimSpace(in.Titulo), strings.TrimSpace(in.Texto)
	if n := len([]rune(in.Titulo)); n < 2 || n > 40 {
		return in, httpx.Invalido("El nombre corto debe tener entre 2 y 40 caracteres.")
	}
	if n := len([]rune(in.Texto)); n < 2 || n > 500 {
		return in, httpx.Invalido("El mensaje debe tener entre 2 y 500 caracteres.")
	}
	return in, nil
}

func (m *Modulo) crearRapida(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	in, err := leerRapida(r)
	if err != nil {
		return err
	}
	var n int
	m.app.DB.QueryRowContext(ctx, `SELECT count(*) FROM respuestas_rapidas WHERE tienda_id=$1`, tid).Scan(&n)
	if n >= 20 {
		return httpx.Invalido("Puedes guardar hasta 20 respuestas rápidas.")
	}
	if _, err := m.app.DB.ExecContext(ctx, `INSERT INTO respuestas_rapidas (tienda_id, titulo, texto) VALUES ($1,$2,$3)`, tid, in.Titulo, in.Texto); err != nil {
		return err
	}
	return m.listarRapidas(w, r)
}

func (m *Modulo) editarRapida(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	in, err := leerRapida(r)
	if err != nil {
		return err
	}
	res, err := m.app.DB.ExecContext(ctx, `UPDATE respuestas_rapidas SET titulo=$3, texto=$4, auto=false WHERE id::text=$1 AND tienda_id=$2`,
		chi.URLParam(r, "id"), tid, in.Titulo, in.Texto)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return httpx.ErrNoEncontrado
	}
	return m.listarRapidas(w, r)
}

func (m *Modulo) borrarRapida(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	if _, err := m.app.DB.ExecContext(ctx, `DELETE FROM respuestas_rapidas WHERE id::text=$1 AND tienda_id=$2`, chi.URLParam(r, "id"), tid); err != nil {
		return err
	}
	return m.listarRapidas(w, r)
}
