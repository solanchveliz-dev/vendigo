// Package compras es el lado del comprador: hacer un pedido sin crear cuenta (verificando su celular por SMS)
// y seguirlo con un enlace secreto. El pago se hace directo a la tienda; VendiGo no recibe el dinero.
package compras

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/solanchveliz-dev/vendigo/api/internal/billetera"
	"github.com/solanchveliz-dev/vendigo/api/internal/core"
	"github.com/solanchveliz-dev/vendigo/api/internal/httpx"
	"github.com/solanchveliz-dev/vendigo/api/internal/pagos"
	"github.com/solanchveliz-dev/vendigo/api/internal/pedidos"
)

type Modulo struct {
	app *core.App
	// Los pone auth: enviar y validar el código SMS del comprador.
	EnviarCodigo func(ctx context.Context, celular, proposito string) (string, error)
	ValidarOTP   func(ctx context.Context, tx *sql.Tx, celular, proposito, codigo string) error
}

func Nuevo(app *core.App) *Modulo { return &Modulo{app: app} }

func (m *Modulo) Rutas(r chi.Router) {
	r.Method("POST", "/compras/codigo", httpx.Handler(m.codigo))
	r.Method("POST", "/compras", httpx.Handler(m.comprar))
	r.Method("GET", "/seguimiento/{token}", httpx.Handler(m.seguimiento))
	r.Method("POST", "/seguimiento/{token}/archivo", httpx.Handler(m.archivo))
	r.Method("POST", "/seguimiento/{token}/comprobante", httpx.Handler(m.comprobante))
	r.Method("POST", "/seguimiento/{token}/recibido", httpx.Handler(m.recibido))
	r.Method("POST", "/seguimiento/{token}/reclamo", httpx.Handler(m.reclamo))
}

var reCelular = regexp.MustCompile(`^9\d{8}$`)

func (m *Modulo) codigo(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Celular string `json:"celular"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Celular = strings.TrimSpace(in.Celular)
	if !reCelular.MatchString(in.Celular) {
		return httpx.Invalido("Escribe un celular de 9 dígitos que empiece con 9.")
	}
	c, err := m.EnviarCodigo(r.Context(), in.Celular, "compra")
	if err != nil {
		return err
	}
	resp := map[string]any{"mensaje": "Te enviamos un código por SMS para confirmar tu pedido."}
	if m.app.Cfg.EsDev() {
		resp["codigo_dev"] = c
	}
	httpx.OK(w, resp)
	return nil
}

type compraReq struct {
	Slug        string              `json:"slug"`
	Items       []pedidos.ItemNuevo `json:"items"`
	Nombre      string              `json:"nombre"`
	Celular     string              `json:"celular"`
	Codigo      string              `json:"codigo"`
	DNI         string              `json:"dni"`
	Entrega     string              `json:"entrega"`
	Direccion   string              `json:"direccion"`
	Distrito    string              `json:"distrito"`
	Ciudad      string              `json:"ciudad"`
	Referencia  string              `json:"referencia"`
	Agencia     string              `json:"agencia"`
	AgenciaSede string              `json:"agencia_sede"`
	MetodoPago  string              `json:"metodo_pago"`
	Nota        string              `json:"nota"`
}

func (m *Modulo) comprar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in compraReq
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Nombre, in.Celular = strings.TrimSpace(in.Nombre), strings.TrimSpace(in.Celular)
	switch {
	case len([]rune(in.Nombre)) < 3 || len([]rune(in.Nombre)) > 80:
		return httpx.Invalido("Escribe tu nombre.")
	case !reCelular.MatchString(in.Celular):
		return httpx.Invalido("Escribe un celular de 9 dígitos que empiece con 9.")
	case in.DNI != "" && !regexp.MustCompile(`^\d{8}$`).MatchString(strings.TrimSpace(in.DNI)):
		return httpx.Invalido("El DNI debe tener 8 dígitos.")
	case in.Entrega == "motorizado" && strings.TrimSpace(in.Direccion) == "":
		return httpx.Invalido("Escribe la dirección de entrega.")
	case in.Entrega == "agencia" && (strings.TrimSpace(in.AgenciaSede) == "" || strings.TrimSpace(in.Ciudad) == ""):
		return httpx.Invalido("Elige la agencia y la sede donde recogerás.")
	case len(in.Nota) > 300:
		return httpx.Invalido("La nota puede tener hasta 300 caracteres.")
	}
	var tid string
	if err := m.app.DB.QueryRowContext(ctx, `SELECT id FROM tiendas WHERE slug=$1 AND activa`, in.Slug).Scan(&tid); err != nil {
		return httpx.ErrNoEncontrado
	}
	var pid, codigo, token string
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		if err := m.ValidarOTP(ctx, tx, in.Celular, "compra", in.Codigo); err != nil {
			return err
		}
		var err error
		pid, codigo, err = pedidos.Crear(ctx, m.app, tx, pedidos.PedidoNuevo{
			TiendaID: tid, Nombre: in.Nombre, Celular: in.Celular, DNI: strings.TrimSpace(in.DNI), Entrega: in.Entrega,
			Direccion: strings.TrimSpace(in.Direccion), Distrito: strings.TrimSpace(in.Distrito), Ciudad: strings.TrimSpace(in.Ciudad),
			Referencia: strings.TrimSpace(in.Referencia), Agencia: strings.TrimSpace(in.Agencia), AgenciaSede: strings.TrimSpace(in.AgenciaSede),
			MetodoPago: in.MetodoPago, Nota: strings.TrimSpace(in.Nota), Items: in.Items,
		})
		if err != nil {
			return err
		}
		return tx.QueryRowContext(ctx, `SELECT token_seguimiento FROM pedidos WHERE id=$1`, pid).Scan(&token)
	})
	if err != nil {
		return err
	}
	enlace := m.app.Cfg.WebURL + "/seguimiento/" + token
	// El SMS es informativo: si falla, el pedido igual queda registrado y el enlace se muestra en pantalla.
	_ = m.app.Avisos.EnviarTexto(ctx, in.Celular, fmt.Sprintf("VendiGo: tu pedido %s quedó registrado. Síguelo y paga a la tienda aquí: %s", codigo, enlace))
	httpx.JSON(w, http.StatusCreated, map[string]string{"codigo": codigo, "token": token, "enlace": enlace})
	return nil
}

func (m *Modulo) seguimiento(w http.ResponseWriter, r *http.Request) error {
	d, t, err := pedidos.CargarComoComprador(r.Context(), m.app, chi.URLParam(r, "token"))
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]any{"pedido": d, "tienda": t, "garantia": pagos.LeerGarantia(r.Context(), m.app.DB)})
	return nil
}

// archivo: URL firmada para que el comprador suba su comprobante o las fotos del reclamo (bucket privado).
func (m *Modulo) archivo(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	pid, _, _, err := pedidos.IDPorToken(ctx, m.app.DB, chi.URLParam(r, "token"))
	if err != nil {
		return err
	}
	var in struct {
		Tipo        string `json:"tipo"`
		ContentType string `json:"content_type"`
		Tamano      int64  `json:"tamano"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	if in.Tipo != "comprobante" && in.Tipo != "reclamo" {
		return httpx.Invalido("Tipo de archivo no válido.")
	}
	if !strings.HasPrefix(in.ContentType, "image/") || in.Tamano <= 0 || in.Tamano > 8<<20 {
		return httpx.Invalido("Sube una imagen de hasta 8 MB.")
	}
	key := in.Tipo + "/" + pid + "/" + uuid.NewString()
	u, err := m.app.Archivos.URLSubida(ctx, false, key, in.ContentType, in.Tamano)
	if err != nil {
		return err
	}
	httpx.OK(w, map[string]string{"key": key, "url_subida": u})
	return nil
}

func (m *Modulo) comprobante(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Key        string `json:"comprobante_key"`
		Referencia string `json:"referencia"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Referencia = strings.TrimSpace(in.Referencia)
	if len(in.Referencia) > 40 {
		return httpx.Invalido("El número de operación es muy largo.")
	}
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		pid, tid, codigo, err := pedidos.IDPorToken(ctx, tx, chi.URLParam(r, "token"))
		if err != nil {
			return err
		}
		if in.Key != "" && !strings.HasPrefix(in.Key, "comprobante/"+pid+"/") {
			return httpx.Invalido("El comprobante no corresponde a este pedido.")
		}
		if in.Key == "" && in.Referencia == "" {
			return httpx.Invalido("Sube la captura de tu pago o escribe el número de operación.")
		}
		if err := pagos.Cambiar(ctx, tx, pid, pagos.Cambio{Estado: "comprobante_enviado", Detalle: "El comprador envió su comprobante de pago.", Referencia: in.Referencia, ComprobanteKey: in.Key}); err != nil {
			return err
		}
		billetera.Notificar(ctx, tx, tid, "Revisa el pago del pedido "+codigo, "El cliente envió su comprobante. Revisa tu Yape/Plin y confirma si te llegó.", "/vendedor/pedidos/"+pid)
		return nil
	})
	if err != nil {
		return err
	}
	return m.seguimiento(w, r)
}

func (m *Modulo) recibido(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		pid, tid, codigo, err := pedidos.IDPorToken(ctx, tx, chi.URLParam(r, "token"))
		if err != nil {
			return err
		}
		if err := pedidos.ConfirmarRecibido(ctx, tx, pid); err != nil {
			return err
		}
		billetera.Notificar(ctx, tx, tid, "Pedido "+codigo+" recibido", "El cliente confirmó que le llegó su pedido.", "/vendedor/pedidos/"+pid)
		return nil
	})
	if err != nil {
		return err
	}
	return m.seguimiento(w, r)
}

func (m *Modulo) reclamo(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	var in struct {
		Motivo      string   `json:"motivo"`
		Descripcion string   `json:"descripcion"`
		Fotos       []string `json:"fotos"`
	}
	if err := httpx.Leer(r, &in); err != nil {
		return err
	}
	in.Descripcion = strings.TrimSpace(in.Descripcion)
	if len([]rune(in.Descripcion)) < 10 || len([]rune(in.Descripcion)) > 1000 {
		return httpx.Invalido("Cuéntanos qué pasó (10 a 1000 caracteres).")
	}
	if len(in.Fotos) > 5 {
		return httpx.Invalido("Puedes subir hasta 5 fotos.")
	}
	err := m.app.EnTransaccion(ctx, func(tx *sql.Tx) error {
		pid, _, _, err := pedidos.IDPorToken(ctx, tx, chi.URLParam(r, "token"))
		if err != nil {
			return err
		}
		for _, f := range in.Fotos {
			if !strings.HasPrefix(f, "reclamo/"+pid+"/") {
				return httpx.Invalido("Una de las fotos no corresponde a este pedido.")
			}
		}
		return pedidos.AbrirReclamo(ctx, tx, pid, in.Motivo, in.Descripcion, in.Fotos)
	})
	if err != nil {
		return err
	}
	return m.seguimiento(w, r)
}
