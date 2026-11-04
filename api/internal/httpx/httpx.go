package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
)

// Error es un error que se muestra al usuario con un código HTTP.
type Error struct {
	Estado  int    `json:"-"`
	Codigo  string `json:"codigo"`
	Mensaje string `json:"mensaje"`
}

func (e *Error) Error() string { return e.Mensaje }

func NuevoError(estado int, codigo, mensaje string) *Error {
	return &Error{Estado: estado, Codigo: codigo, Mensaje: mensaje}
}

var (
	ErrNoAutorizado = NuevoError(http.StatusUnauthorized, "no_autorizado", "Inicia sesión para continuar.")
	ErrProhibido    = NuevoError(http.StatusForbidden, "prohibido", "No tienes permiso para hacer esto.")
	ErrNoEncontrado = NuevoError(http.StatusNotFound, "no_encontrado", "No encontramos lo que buscas.")
)

func Invalido(mensaje string) *Error {
	return NuevoError(http.StatusBadRequest, "datos_invalidos", mensaje)
}

func Conflicto(codigo, mensaje string) *Error {
	return NuevoError(http.StatusConflict, codigo, mensaje)
}

func JSON(w http.ResponseWriter, estado int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(estado)
	if v != nil {
		json.NewEncoder(w).Encode(v)
	}
}

func OK(w http.ResponseWriter, v any) { JSON(w, http.StatusOK, v) }

func Fallo(w http.ResponseWriter, r *http.Request, err error) {
	var e *Error
	if errors.As(err, &e) {
		JSON(w, e.Estado, e)
		return
	}
	slog.Error("error interno", "ruta", r.URL.Path, "err", err)
	JSON(w, http.StatusInternalServerError, NuevoError(500, "error_interno", "Algo salió mal. Inténtalo de nuevo."))
}

// Leer decodifica el cuerpo JSON con un límite de 1 MB.
func Leer(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return Invalido("Los datos enviados no tienen el formato correcto.")
	}
	return nil
}

// Handler permite escribir handlers que devuelven error.
type Handler func(w http.ResponseWriter, r *http.Request) error

func (h Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := h(w, r); err != nil {
		Fallo(w, r, err)
	}
}

func QueryInt(r *http.Request, k string, def int) int {
	if n, err := strconv.Atoi(r.URL.Query().Get(k)); err == nil {
		return n
	}
	return def
}

func IP(r *http.Request) string {
	if f := r.Header.Get("X-Forwarded-For"); f != "" {
		return strings.TrimSpace(strings.Split(f, ",")[0])
	}
	h := r.RemoteAddr
	if i := strings.LastIndex(h, ":"); i > 0 {
		return h[:i]
	}
	return h
}
