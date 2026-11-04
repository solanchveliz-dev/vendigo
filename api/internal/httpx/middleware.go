package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/solanchveliz-dev/vendigo/api/internal/seguridad"
)

type ctxKey int

const usuarioKey ctxKey = 1

type Usuario struct {
	ID  string
	Rol string
}

func UsuarioDe(ctx context.Context) (Usuario, bool) {
	u, ok := ctx.Value(usuarioKey).(Usuario)
	return u, ok
}

// ConUsuario se usa en pruebas para simular una sesión.
func ConUsuario(ctx context.Context, u Usuario) context.Context {
	return context.WithValue(ctx, usuarioKey, u)
}

// Autenticar valida el token Bearer y guarda el usuario en el contexto.
func Autenticar(secreto string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			token, ok := strings.CutPrefix(h, "Bearer ")
			if !ok || token == "" {
				Fallo(w, r, ErrNoAutorizado)
				return
			}
			c, err := seguridad.LeerAcceso(secreto, token)
			if err != nil {
				Fallo(w, r, ErrNoAutorizado)
				return
			}
			ctx := context.WithValue(r.Context(), usuarioKey, Usuario{ID: c.Subject, Rol: c.Rol})
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// Rol permite el paso solo a los roles indicados.
func Rol(roles ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, ok := UsuarioDe(r.Context())
			if !ok {
				Fallo(w, r, ErrNoAutorizado)
				return
			}
			for _, rol := range roles {
				if u.Rol == rol {
					next.ServeHTTP(w, r)
					return
				}
			}
			Fallo(w, r, ErrProhibido)
		})
	}
}

func CORS(origen string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", origen)
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Vary", "Origin")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func Seguridad(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(w, r)
	})
}

type grabador struct {
	http.ResponseWriter
	estado int
}

func (g *grabador) WriteHeader(c int) { g.estado = c; g.ResponseWriter.WriteHeader(c) }

func Registro(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ini := time.Now()
		g := &grabador{ResponseWriter: w, estado: 200}
		next.ServeHTTP(g, r)
		slog.Info("petición", "metodo", r.Method, "ruta", r.URL.Path, "estado", g.estado, "ms", time.Since(ini).Milliseconds())
	})
}

// Limite aplica un límite simple de peticiones por IP (ventana fija).
// En producción se complementa con AWS WAF.
func Limite(maximo int, ventana time.Duration) func(http.Handler) http.Handler {
	var mu sync.Mutex
	conteo := map[string]int{}
	inicio := time.Now()
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			if time.Since(inicio) > ventana {
				conteo = map[string]int{}
				inicio = time.Now()
			}
			k := IP(r) + r.URL.Path
			conteo[k]++
			n := conteo[k]
			mu.Unlock()
			if n > maximo {
				Fallo(w, r, NuevoError(http.StatusTooManyRequests, "demasiados_intentos", "Hiciste demasiados intentos. Espera unos minutos."))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
