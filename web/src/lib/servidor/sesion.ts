import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const API_URL = (process.env.API_URL ?? "http://localhost:8080").replace(/\/$/, "");
export const COOKIE_ACCESO = "vg_at";
export const COOKIE_REFRESH = "vg_rt";
// "Recordar mi sesión": si no está marcado, las cookies duran solo hasta cerrar el navegador.
export const COOKIE_RECORDAR = "vg_rec";

const seguro = process.env.NODE_ENV === "production";

export type Sesion = {
  access_token: string;
  refresh_token: string;
  expira_en: number;
  usuario: { id: string; nombre: string; celular: string; email: string | null; rol: string; tienda_id: string | null };
};

// Los tokens viven en cookies httpOnly: el JavaScript del navegador no puede leerlos.
export function guardarSesion(res: NextResponse, s: Sesion, recordar = true) {
  const duracion = recordar ? { maxAge: 60 * 60 * 24 * 30 } : {};
  const op = { httpOnly: true, secure: seguro, sameSite: "lax" as const, path: "/", ...duracion };
  res.cookies.set(COOKIE_ACCESO, s.access_token, op);
  res.cookies.set(COOKIE_REFRESH, s.refresh_token, op);
  res.cookies.set(COOKIE_RECORDAR, recordar ? "1" : "0", op);
}

export function borrarSesion(res: NextResponse) {
  res.cookies.set(COOKIE_ACCESO, "", { path: "/", maxAge: 0 });
  res.cookies.set(COOKIE_REFRESH, "", { path: "/", maxAge: 0 });
  res.cookies.set(COOKIE_RECORDAR, "", { path: "/", maxAge: 0 });
}

export async function tokens() {
  const c = await cookies();
  return { acceso: c.get(COOKIE_ACCESO)?.value, refresh: c.get(COOKIE_REFRESH)?.value, recordar: c.get(COOKIE_RECORDAR)?.value !== "0" };
}

export async function renovar(refresh: string): Promise<Sesion | null> {
  const r = await fetch(`${API_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
    cache: "no-store",
  });
  return r.ok ? ((await r.json()) as Sesion) : null;
}
