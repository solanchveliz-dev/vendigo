import { NextResponse, type NextRequest } from "next/server";
import { API_URL, guardarSesion, renovar, tokens, type Sesion } from "@/lib/servidor/sesion";

// Puente entre el navegador y la API en Go: agrega el token guardado en la cookie
// y, si venció, lo renueva una sola vez con el refresh token.
async function reenviar(req: NextRequest, ruta: string[]) {
  const destino = `${API_URL}/api/v1/${ruta.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const cuerpo = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();
  const { acceso, refresh } = await tokens();

  const llamar = (token?: string) =>
    fetch(destino, {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-Forwarded-For": req.headers.get("x-forwarded-for") ?? "",
      },
      body: cuerpo,
      cache: "no-store",
    });

  let r = await llamar(acceso);
  let nueva: Sesion | null = null;
  if (r.status === 401 && refresh) {
    nueva = await renovar(refresh);
    if (nueva) r = await llamar(nueva.access_token);
  }
  const res = new NextResponse(r.status === 204 ? null : await r.text(), {
    status: r.status,
    headers: { "Content-Type": r.headers.get("Content-Type") ?? "application/json" },
  });
  if (nueva) guardarSesion(res, nueva);
  return res;
}

type Ctx = { params: Promise<{ ruta: string[] }> };
export async function GET(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
export async function POST(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
export async function PUT(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
export async function PATCH(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
export async function DELETE(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
