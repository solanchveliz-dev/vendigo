package ia

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
	"github.com/solanchveliz-dev/vendigo/api/internal/tiendas"
)

// Analista de ventas: la API calcula los números (pedidos.Analizar) y la IA solo los interpreta.
// Nunca inventa cifras: todo lo que dice sale de los datos que le pasamos.

type Recomendacion struct {
	Tipo   string `json:"tipo"` // reponer, impulsar, revisar, dias, general
	Titulo string `json:"titulo"`
	Texto  string `json:"texto"`
}

type Analisis struct {
	Resumen         string          `json:"resumen"`
	Recomendaciones []Recomendacion `json:"recomendaciones"`
}

var diasLargos = map[string]string{"Lun": "lunes", "Mar": "martes", "Mié": "miércoles", "Jue": "jueves", "Vie": "viernes", "Sáb": "sábados", "Dom": "domingos"}

// reglas arma recomendaciones directas desde los datos. Se usan como base para la IA
// y como respuesta en el modo simulado (sin costo), así la demo muestra datos reales.
func reglas(a *pedidos.Analitica, pregunta string) Analisis {
	out := Analisis{Recomendaciones: []Recomendacion{}}
	cambio := ""
	if a.VentasAnterior > 0 {
		c := float64(a.Ventas-a.VentasAnterior) * 100 / float64(a.VentasAnterior)
		cambio = fmt.Sprintf(" (%+.0f %% frente a los %d días anteriores)", c, a.Dias)
	}
	out.Resumen = fmt.Sprintf("En los últimos %d días vendiste S/ %.2f en %d pedidos%s.", a.Dias, float64(a.Ventas)/100, a.Pedidos, cambio)
	if a.Pedidos == 0 {
		out.Resumen = fmt.Sprintf("En los últimos %d días no tuviste pedidos.", a.Dias)
	}

	p := append([]pedidos.Pronostico(nil), a.Productos...)
	// Reponer: lo que se agota pronto.
	sort.Slice(p, func(i, j int) bool { return dias(p[i]) < dias(p[j]) })
	usados := map[string]bool{}
	for _, x := range p {
		if x.DiasAgotar != nil && *x.DiasAgotar <= 14 && x.Proximas4 > 0 && len(out.Recomendaciones) < 2 {
			cuando := "Repón en los próximos días."
			if *x.DiasAgotar <= 7 {
				cuando = "Repón esta semana."
			}
			usados[x.ProductoID] = true
			t := fmt.Sprintf("Al ritmo actual se agota en unos %d días (quedan %d y se estima vender %d en 4 semanas). %s", *x.DiasAgotar, x.Stock, x.Proximas4, cuando)
			if *x.DiasAgotar == 0 {
				t = fmt.Sprintf("Está agotado y se estima que venderías %d en las próximas 4 semanas. Repón stock para no perder esas ventas.", x.Proximas4)
			}
			out.Recomendaciones = append(out.Recomendaciones, Recomendacion{Tipo: "reponer", Titulo: "Repón " + x.Nombre, Texto: t})
		}
	}
	// Impulsar: lo que sube y tiene stock.
	sort.Slice(p, func(i, j int) bool { return p[i].Proximas4 > p[j].Proximas4 })
	for _, x := range p {
		if x.Tendencia == "sube" && x.Vendidos >= 3 && x.Stock > 3 && !usados[x.ProductoID] {
			out.Recomendaciones = append(out.Recomendaciones, Recomendacion{Tipo: "impulsar", Titulo: "Impulsa " + x.Nombre,
				Texto: fmt.Sprintf("Sus ventas vienen subiendo: vendiste %d en los últimos %d días y se estima %d en las próximas 4 semanas. Compártelo en tus redes y destácalo en tu tienda.", x.Vendidos, a.Dias, x.Proximas4)})
			break
		}
	}
	// Revisar: lo que baja o tiene visitas sin ventas.
	for _, x := range p {
		if x.Tendencia == "baja" && x.CambioPct != nil && *x.CambioPct <= -30 {
			out.Recomendaciones = append(out.Recomendaciones, Recomendacion{Tipo: "revisar", Titulo: "Revisa " + x.Nombre,
				Texto: fmt.Sprintf("Vendió %d %% menos que el periodo anterior (%d frente a %d). Prueba mejores fotos, revisa el precio o ponle una oferta por unos días.", -*x.CambioPct, x.Vendidos, x.Anterior)})
			break
		}
	}
	for _, x := range p {
		if x.Visitas >= 20 && x.Vendidos == 0 && x.Stock > 0 {
			out.Recomendaciones = append(out.Recomendaciones, Recomendacion{Tipo: "revisar", Titulo: "Muchas visitas, sin ventas: " + x.Nombre,
				Texto: fmt.Sprintf("Tuvo %d visitas y ninguna venta en %d días. Revisa que la foto, la descripción y el precio sean claros.", x.Visitas, a.Dias)})
			break
		}
	}
	// Días fuertes.
	d := append([]pedidos.Barra(nil), a.DiasSemana...)
	sort.SliceStable(d, func(i, j int) bool { return d[i].Valor > d[j].Valor })
	if len(d) >= 2 && d[0].Valor+d[1].Valor >= 4 {
		out.Recomendaciones = append(out.Recomendaciones, Recomendacion{Tipo: "dias", Titulo: "Tus mejores días",
			Texto: fmt.Sprintf("Tus clientes compran más los %s y %s. Publica o comparte tus productos un día antes.", diasLargos[d[0].Etiqueta], diasLargos[d[1].Etiqueta])})
	}
	if len(out.Recomendaciones) == 0 {
		out.Recomendaciones = append(out.Recomendaciones, Recomendacion{Tipo: "general", Titulo: "Aún hay pocos datos",
			Texto: "Con más pedidos podré decirte qué reponer y qué impulsar. Mientras tanto, comparte el enlace de tu tienda en tus redes."})
	}

	// Si hizo una pregunta, primero lo que responde a esa pregunta.
	if q := strings.ToLower(pregunta); q != "" {
		tipo := ""
		switch {
		case strings.Contains(q, "repon") || strings.Contains(q, "stock") || strings.Contains(q, "agot"):
			tipo = "reponer"
		case strings.Contains(q, "promoc") || strings.Contains(q, "impuls") || strings.Contains(q, "destac"):
			tipo = "impulsar"
		case strings.Contains(q, "precio") || strings.Contains(q, "baj") || strings.Contains(q, "no se vende"):
			tipo = "revisar"
		case strings.Contains(q, "día") || strings.Contains(q, "dia") || strings.Contains(q, "cuándo") || strings.Contains(q, "cuando"):
			tipo = "dias"
		}
		sort.SliceStable(out.Recomendaciones, func(i, j int) bool {
			return out.Recomendaciones[i].Tipo == tipo && out.Recomendaciones[j].Tipo != tipo
		})
	}
	if len(out.Recomendaciones) > 5 {
		out.Recomendaciones = out.Recomendaciones[:5]
	}
	return out
}

func dias(x pedidos.Pronostico) int {
	if x.DiasAgotar == nil {
		return 1 << 30
	}
	return *x.DiasAgotar
}

func (m *Modulo) analista(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	tid, err := tiendas.ID(ctx, m.app)
	if err != nil {
		return err
	}
	var in struct {
		Pregunta string `json:"pregunta"`
		Dias     int    `json:"dias"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Pregunta = strings.TrimSpace(in.Pregunta)
	if len([]rune(in.Pregunta)) > 200 {
		return httpx.Invalido("La pregunta puede tener hasta 200 caracteres.")
	}
	if _, nivel := pedidos.NivelPlan(ctx, m.app.DB, tid); nivel < 2 {
		return pedidos.ErrPlanAnalitica
	} else if in.Dias == 90 && nivel < 3 {
		in.Dias = 30
	}
	a, err := pedidos.Analizar(ctx, m.app.DB, tid, in.Dias)
	if err != nil {
		return err
	}
	base := reglas(a, in.Pregunta)

	res, c, err := m.usar(ctx, tid, "analista_ventas", func() (any, error) {
		if _, simulado := m.proveedor.(Simulado); simulado {
			return base, nil
		}
		datos, _ := json.Marshal(resumenParaIA(a))
		pistas, _ := json.Marshal(base.Recomendaciones)
		instr := fmt.Sprintf(`Eres un ANALISTA de ventas para una pequeña tienda peruana que vende por redes. Habla simple, cercano y en español peruano.
Usa SOLO estos datos reales de la tienda (montos en céntimos de sol; "pronostico_4sem" y "dias_para_agotar" ya están calculados):
%s
Ideas calculadas a partir de los datos (puedes mejorarlas, no inventes otras cifras):
%s
Pregunta del vendedor (puede estar vacía): "%s"
Devuelve SOLO un JSON con esta forma: {"resumen":"una o dos frases","recomendaciones":[{"tipo":"reponer|impulsar|revisar|dias|general","titulo":"corto","texto":"una o dos frases con la acción concreta"}]}
Máximo 5 recomendaciones. Si la pregunta no se puede responder con los datos, dilo en el resumen. Nunca inventes números, precios de otras tiendas ni datos que no estén arriba.`,
			datos, pistas, strings.ReplaceAll(in.Pregunta, `"`, "'"))
		txt, err := m.proveedor.Preguntar(ctx, instr, nil, "")
		if err != nil {
			return nil, err
		}
		var out Analisis
		if extraerJSON(txt, &out) != nil || out.Resumen == "" || len(out.Recomendaciones) == 0 {
			return base, nil // si la IA responde raro, mostramos el análisis calculado
		}
		if len(out.Recomendaciones) > 5 {
			out.Recomendaciones = out.Recomendaciones[:5]
		}
		return out, nil
	})
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"analisis": res, "creditos": c})
	return nil
}

// resumenParaIA reduce los datos a lo necesario (menos tokens = menos costo).
func resumenParaIA(a *pedidos.Analitica) map[string]any {
	prods := []map[string]any{}
	for i, x := range a.Productos {
		if i >= 15 {
			break
		}
		p := map[string]any{"nombre": x.Nombre, "stock": x.Stock, "vendidos": x.Vendidos, "vendidos_anterior": x.Anterior,
			"semanas": x.Semanas, "pronostico_4sem": x.Proximas4, "tendencia": x.Tendencia, "visitas": x.Visitas}
		if x.DiasAgotar != nil {
			p["dias_para_agotar"] = *x.DiasAgotar
		}
		prods = append(prods, p)
	}
	return map[string]any{"dias": a.Dias, "ventas": a.Ventas, "ventas_periodo_anterior": a.VentasAnterior, "pedidos": a.Pedidos,
		"clientes": a.Clientes, "nuevos": a.Nuevos, "pedidos_por_dia_semana_90d": a.DiasSemana, "productos": prods}
}
