"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ErrorApi extends Error {
  constructor(public estado: number, public codigo: string, mensaje: string) {
    super(mensaje);
  }
}

// Tiempo máximo de espera: sin esto, si la API no responde la página se queda en "Cargando…" para siempre.
const ESPERA_MS = 25_000;

async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api/v1${ruta}`, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      cache: "no-store",
      signal: AbortSignal.timeout(ESPERA_MS),
    });
  } catch (e) {
    const tiempo = (e as Error)?.name === "TimeoutError";
    throw new ErrorApi(0, tiempo ? "sin_respuesta" : "sin_conexion",
      tiempo ? "El servidor de VendiGo tardó demasiado en responder. Inténtalo de nuevo." : "No pudimos conectar con VendiGo. Revisa tu conexión e inténtalo de nuevo.");
  }
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && typeof window !== "undefined" && !ruta.startsWith("/auth")) {
      window.location.href = `/ingresar?siguiente=${encodeURIComponent(window.location.pathname)}`;
    }
    // Si el administrador suspendió la cuenta, se cierra la sesión y se explica en el ingreso.
    if (r.status === 403 && datos?.codigo === "cuenta_suspendida" && typeof window !== "undefined") {
      limpiarRecientes();
      await fetch("/api/sesion/salir", { method: "POST" }).catch(() => null);
      window.location.href = "/ingresar?suspendida=1";
    }
    const generico = r.status >= 500 ? `El servidor de VendiGo no respondió bien (error ${r.status}). Inténtalo en unos segundos.` : "Algo salió mal. Inténtalo de nuevo.";
    throw new ErrorApi(r.status, datos?.codigo ?? "error", datos?.mensaje ?? generico);
  }
  return datos as T;
}

export const api = {
  get: <T,>(ruta: string) => llamar<T>("GET", ruta),
  post: <T,>(ruta: string, cuerpo: unknown = {}) => llamar<T>("POST", ruta, cuerpo),
  put: <T,>(ruta: string, cuerpo: unknown) => llamar<T>("PUT", ruta, cuerpo),
  patch: <T,>(ruta: string, cuerpo: unknown) => llamar<T>("PATCH", ruta, cuerpo),
  del: <T,>(ruta: string) => llamar<T>("DELETE", ruta),
};

// Última respuesta de cada GET, solo en la memoria de esta pestaña: al volver a una página se muestra al instante
// y se actualiza por detrás. Se vacía al iniciar o cerrar sesión para no mezclar datos entre cuentas.
const recientes = new Map<string, unknown>();
export function limpiarRecientes() {
  recientes.clear();
}

export async function sesion<T>(accion: "ingresar" | "verificar" | "mfa" | "renovar" | "salir", cuerpo: unknown = {}): Promise<T> {
  if (accion !== "renovar") limpiarRecientes();
  const r = await fetch(`/api/sesion/${accion}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorApi(r.status, datos?.codigo ?? "error", datos?.mensaje ?? "Algo salió mal.");
  return datos as T;
}

function avisarCarga(evento: string, detalle: object) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(evento, { detail: detalle }));
}

// useApi carga datos de una ruta y permite recargarlos después de una acción.
// Si falla, avisa con el evento "vg:error-carga" (lo muestra <ErrorCarga /> en los paneles).
export function useApi<T>(ruta: string | null) {
  const [datos, setDatos] = useState<T | null>(() => (ruta && recientes.has(ruta) ? (recientes.get(ruta) as T) : null));
  const [error, setError] = useState<ErrorApi | null>(null);
  const [cargando, setCargando] = useState(() => !(ruta && recientes.has(ruta)));
  const actual = useRef(ruta);
  actual.current = ruta;

  const recargar = useCallback(async () => {
    if (!actual.current) return;
    const r = actual.current;
    try {
      const d = await api.get<T>(r);
      recientes.set(r, d);
      if (actual.current === r) {
        setDatos(d);
        setError(null);
      }
      avisarCarga("vg:carga-ok", { ruta: r });
    } catch (e) {
      const err = e as ErrorApi;
      if (actual.current === r) setError(err);
      // 401 ya lleva al ingreso; lo demás se muestra en el aviso de error de carga del panel.
      if (err?.estado !== 401) avisarCarga("vg:error-carga", { ruta: r, estado: err?.estado ?? 0, mensaje: err?.message || "Algo salió mal." });
    } finally {
      if (actual.current === r) setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Si ya se vio esta página, se muestra lo último que se cargó mientras llega lo nuevo (sin "Cargando…").
    if (ruta && recientes.has(ruta)) {
      setDatos(recientes.get(ruta) as T);
      setCargando(false);
    } else {
      setCargando(true);
    }
    recargar();
  }, [ruta, recargar]);

  return { datos, error, cargando, recargar, setDatos };
}
