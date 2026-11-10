package ia

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/planes"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// La IA no responde mensajes: automatiza tareas del vendedor. Cada herramienta gasta créditos del plan.
var Costos = map[string]int{"publicar_con_foto": 3, "analista_ventas": 2, "resumen_opiniones": 0}

// El paquete extra (100 créditos por S/ 5) se define en planes: es un pago a VendiGo, solo con Culqi.
const paqueteCreditos = planes.PaqueteCreditosIA

type Modulo struct {
	app       *core.App
	proveedor Proveedor
}

func Nuevo(app *core.App, p Proveedor) *Modulo { return &Modulo{app: app, proveedor: p} }

func (m *Modulo) RutasVendedor(r chi.Router) {
	r.Method("GET", "/ia", httpx.Handler(m.estado))
	r.Method("POST", "/ia/creditos-extra", httpx.Handler(m.comprarCreditos))
	r.Group(func(r chi.Router) {
		r.Use(httpx.Limite(30, time.Minute))
		r.Method("POST", "/ia/publicar-con-foto", httpx.Handler(m.publicarConFoto))
		r.Method("POST", "/ia/analista", httpx.Handler(m.analista))
	})
}

var lima = time.FixedZone("Lima", -5*3600)

func inicioMes() time.Time {
	n := time.Now().In(lima)
	return time.Date(n.Year(), n.Month(), 1, 0, 0, 0, 0, lima)
}

type Creditos struct {
	Plan   int            `json:"del_plan"`
	Extra  int            `json:"extra"`
	Usados int            `json:"usados"`
	Quedan int            `json:"quedan"`
	Costos map[string]int `json:"costos"`
	// Llave pública de Culqi para comprar créditos extra (vacía si el cobro con Culqi no está configurado).
	CulqiPublica string `json:"culqi_publica"`
}

func (m *Modulo) leer(ctx context.Context, q core.Ejecutor, tid string) (Creditos, error) {
	c := Creditos{Costos: Costos}
	mes := inicioMes()
	if err := q.QueryRowContext(ctx, `SELECT p.creditos_ia FROM suscripciones s JOIN planes p ON p.id=s.plan_id WHERE s.tienda_id=$1 AND s.activa`, tid).Scan(&c.Plan); err != nil {
		return c, err
	}
	q.QueryRowContext(ctx, `SELECT COALESCE(SUM(cantidad),0) FROM creditos_extra WHERE tienda_id=$1 AND periodo=$2`, tid, mes.Format("2006-01-02")).Scan(&c.Extra)
	q.QueryRowContext(ctx, `SELECT COALESCE(SUM(creditos),0) FROM uso_ia WHERE tienda_id=$1 AND creado_en >= $2`, tid, mes).Scan(&c.Usados)
	c.Quedan = max(c.Plan+c.Extra-c.Usados, 0)
	return c, nil
}

func (m *Modulo) estado(w http.ResponseWriter, r *http.Request) error {
	tid, err := tiendas.ID(r.Context(), m.app)
	if err != nil {
		return err
	}
	c, err := m.leer(r.Context(), m.app.DB, tid)
	if err != nil {
		return err
	}
	if m.culqiListo() {
		c.CulqiPublica = m.app.Cfg.CulqiPublica
	}
	httpx.OK(w, c)
	return nil
}

func (m *Modulo) culqiListo() bool {
	return m.app.Cfg.CulqiPublica != "" && m.app.Cfg.CulqiSecreta != ""
}

// usar valida los créditos, ejecuta la herramienta y solo descuenta si salió bien.
func (m *Modulo) usar(ctx context.Context, tid, herramienta string, fn func() (any, error)) (any, Creditos, error) {
	c, err := m.leer(ctx, m.app.DB, tid)
	if err != nil {
		return nil, c, err
	}
	costo := Costos[herramienta]
	if c.Quedan < costo {
		return nil, c, httpx.Conflicto("sin_creditos", fmt.Sprintf("No te quedan créditos de IA este mes. Compra +%d créditos por S/ 5 o cambia de plan.", paqueteCreditos))
	}
	res, err := fn()
	if err != nil {
		slog.Error("ia", "herramienta", herramienta, "err", err)
		if _, ok := err.(*httpx.Error); ok {
			return nil, c, err
		}
		return nil, c, httpx.NuevoError(http.StatusBadGateway, "ia_no_disponible", "La IA no pudo leer la imagen. Inténtalo de nuevo o completa los datos a mano. No se descontaron créditos.")
	}
	if costo > 0 {
		m.app.DB.ExecContext(ctx, `INSERT INTO uso_ia (tienda_id, herramienta, creditos) VALUES ($1,$2,$3)`, tid, herramienta, costo)
	}
	c, _ = m.leer(ctx, m.app.DB, tid)
	return res, c, nil
}

func (m *Modulo) imagen(ctx context.Context, tid, key, tipo string, publico bool) ([]byte, string, error) {
	if !strings.HasPrefix(key, tipo+"/"+tid+"/") {
		return nil, "", httpx.Invalido("La imagen no pertenece a tu tienda.")
	}
	data, ct, err := m.app.Archivos.Leer(ctx, publico, key)
	if err != nil {
		return nil, "", httpx.Invalido("No encontramos la imagen. Súbela de nuevo.")
	}
	return data, ct, nil
}

// ---------- publicar con foto ----------

type Sugerencia struct {
	Nombre          string   `json:"nombre"`
	Descripcion     string   `json:"descripcion"`
	Categoria       string   `json:"categoria"`
	Caracteristicas []string `json:"caracteristicas"`
}

const instruccionProducto = `Eres un asistente que ayuda a emprendedores peruanos a publicar PRODUCTOS en su tienda online.
Mira la foto y responde SOLO con un JSON con este formato:
{"nombre":"...","descripcion":"...","categoria":"...","caracteristicas":["...","..."]}
Reglas: nombre de máximo 60 caracteres; descripción de 2 o 3 oraciones, clara y sin exagerar; categoría de 1 o 2 palabras;
hasta 4 características visibles en la foto. No inventes marcas, medidas ni materiales que no se vean. Español de Perú.`

func (m *Modulo) publicarConFoto(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		ImagenKey string `json:"imagen_key"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	res, c, err := m.usar(ctx, tid, "publicar_con_foto", func() (any, error) {
		img, ct, err := m.imagen(ctx, tid, in.ImagenKey, "producto", true)
		if err != nil {
			return nil, err
		}
		txt, err := m.proveedor.Preguntar(ctx, instruccionProducto, img, ct)
		if err != nil {
			return nil, err
		}
		var s Sugerencia
		if err := extraerJSON(txt, &s); err != nil {
			return nil, err
		}
		return s, nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"sugerencia": res, "creditos": c, "aviso": "Revisa los datos antes de publicar."})
	return nil
}

// comprarCreditos crea el pago de +100 créditos para cobrarlo con Culqi. NO entrega los créditos:
// se suman recién cuando Culqi aprueba el cobro (POST /vendedor/plan/pagos/{id}/culqi → planes.ConfirmarPago).
func (m *Modulo) comprarCreditos(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	if !m.culqiListo() {
		return httpx.Conflicto("sin_culqi", "La compra de créditos con Culqi todavía no está disponible.")
	}
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var id string
	err = m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		// Un intento anterior que no llegó a cobrarse se reemplaza por este.
		if _, err := tx.ExecContext(ctx, `DELETE FROM pagos_plan WHERE tienda_id=$1 AND tipo='creditos_ia' AND estado='pendiente' AND referencia_tienda=''`, tid); err != nil {
			return err
		}
		return tx.QueryRowContext(ctx, `INSERT INTO pagos_plan (tienda_id, concepto, monto_centimos, metodo, estado, tipo)
			VALUES ($1,$2,$3,'culqi','pendiente','creditos_ia') RETURNING id::text`,
			tid, fmt.Sprintf("+%d créditos de IA", paqueteCreditos), planes.PrecioCreditosIA).Scan(&id)
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"id": id, "monto_centimos": planes.PrecioCreditosIA, "creditos": paqueteCreditos})
	return nil
}
