import { NextResponse, type NextRequest } from "next/server";
import { API_URL, borrarSesion, guardarSesion, renovar, tokens, type Sesion } from "@/lib/servidor/sesion";

// Acciones que crean o cierran la sesión. El resto de llamadas pasa por /api/v1/*.
const destinos: Record<string, string> = {
  ingresar: "/api/v1/auth/login",
  verificar: "/api/v1/auth/verificar",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ accion: string }> }) {
  const { accion } = await params;

  if (accion === "salir") {
    const { refresh } = await tokens();
    if (refresh) {
      await fetch(`${API_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      }).catch(() => null);
    }
    const res = NextResponse.json({ mensaje: "Sesión cerrada." });
    borrarSesion(res);
    return res;
  }

  if (accion === "renovar") {
    const { refresh } = await tokens();
    const s = refresh ? await renovar(refresh) : null;
    if (!s) return NextResponse.json({ codigo: "no_autorizado", mensaje: "Inicia sesión para continuar." }, { status: 401 });
    const res = NextResponse.json({ usuario: s.usuario });
    guardarSesion(res, s);
    return res;
  }

  const destino = destinos[accion];
  if (!destino) return NextResponse.json({ mensaje: "No encontrado." }, { status: 404 });

  const r = await fetch(API_URL + destino, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": req.headers.get("x-forwarded-for") ?? "" },
    body: await req.text(),
    cache: "no-store",
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json(datos, { status: r.status });
  const s = datos as Sesion;
  const res = NextResponse.json({ usuario: s.usuario });
  guardarSesion(res, s);
  return res;
}
