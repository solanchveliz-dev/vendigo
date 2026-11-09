"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ErrorApi extends Error {
  constructor(public estado: number, public codigo: string, mensaje: string) {
    super(mensaje);
  }
}

async function llamar<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const r = await fetch(`/api/v1${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 401 && typeof window !== "undefined" && !ruta.startsWith("/auth")) {
      window.location.href = `/ingresar?siguiente=${encodeURIComponent(window.location.pathname)}`;
    }
    // Si el administrador suspendió la cuenta, se cierra la sesión y se explica en el ingreso.
    if (r.status === 403 && datos?.codigo === "cuenta_suspendida" && typeof window !== "undefined") {
      await fetch("/api/sesion/salir", { method: "POST" }).catch(() => null);
      window.location.href = "/ingresar?suspendida=1";
    }
    throw new ErrorApi(r.status, datos?.codigo ?? "error", datos?.mensaje ?? "Algo salió mal. Inténtalo de nuevo.");
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

export async function sesion<T>(accion: "ingresar" | "verificar" | "mfa" | "renovar" | "salir", cuerpo: unknown = {}): Promise<T> {
  const r = await fetch(`/api/sesion/${accion}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const datos = await r.json().catch(() => null);
  if (!r.ok) throw new ErrorApi(r.status, datos?.codigo ?? "error", datos?.mensaje ?? "Algo salió mal.");
  return datos as T;
}

// useApi carga datos de una ruta y permite recargarlos después de una acción.
export function useApi<T>(ruta: string | null) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<ErrorApi | null>(null);
  const [cargando, setCargando] = useState(true);
  const actual = useRef(ruta);
  actual.current = ruta;

  const recargar = useCallback(async () => {
    if (!actual.current) return;
    const r = actual.current;
    try {
      const d = await api.get<T>(r);
      if (actual.current === r) {
        setDatos(d);
        setError(null);
      }
    } catch (e) {
      if (actual.current === r) setError(e as ErrorApi);
    } finally {
      if (actual.current === r) setCargando(false);
    }
  }, []);

  useEffect(() => {
    setCargando(true);
    recargar();
  }, [ruta, recargar]);

  return { datos, error, cargando, recargar, setDatos };
}
