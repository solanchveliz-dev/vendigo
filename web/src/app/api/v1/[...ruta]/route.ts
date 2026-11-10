import { NextResponse, type NextRequest } from "next/server";
import { API_URL, guardarSesion, renovar, tokens, type Sesion } from "@/lib/servidor/sesion";

// Puente entre el navegador y la API en Go: agrega el token guardado en la cookie
// y, si venció, lo renueva una sola vez con el refresh token.
async function reenviar(req: NextRequest, ruta: string[]) {
  const destino = `${API_URL}/api/v1/${ruta.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const cuerpo = ["GET", "HEAD"].includes(req.method) ? undefined : await req.text();
  const { acceso, refresh, recordar } = await tokens();
  // Cambiar la contraseña o cerrar las otras sesiones necesita saber cuál es la sesión de este equipo,
  // para no cerrarla. El refresh token vive en una cookie que el navegador no puede leer, así que se agrega aquí.
  const conSesion = ruta.join("/") === "me/password" || ruta.join("/") === "me/cerrar-sesiones";
  const cuerpoCon = (r?: string) => {
    if (!conSesion) return cuerpo;
    let d: Record<string, unknown> = {};
    try { d = cuerpo ? JSON.parse(cuerpo) : {}; } catch { d = {}; }
    return JSON.stringify({ ...d, refresh_token: r ?? "" });
  };

  const llamar = (token?: string, r: string | undefined = refresh) =>
    fetch(destino, {
      signal: AbortSignal.timeout(20_000),
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "X-Forwarded-For": req.headers.get("x-forwarded-for") ?? "",
      },
      body: cuerpoCon(r),
      cache: "no-store",
    });

  let r: Response;
  let nueva: Sesion | null = null;
  try {
    r = await llamar(acceso);
    if (r.status === 401 && refresh) {
      nueva = await renovar(refresh);
      if (nueva) r = await llamar(nueva.access_token, nueva.refresh_token);
    }
  } catch (e) {
    // La API está apagada, reiniciándose o no respondió a tiempo: se responde en JSON para que la página lo muestre.
    const tiempo = (e as Error)?.name === "TimeoutError";
    const dev = process.env.NODE_ENV !== "production";
    const mensaje = tiempo
      ? "La API de VendiGo tardó demasiado en responder."
      : dev
        ? `No se pudo conectar con la API en ${API_URL}. ¿Está corriendo (go run ./cmd/api)?`
        : "El servidor de VendiGo no está disponible en este momento. Inténtalo en unos segundos.";
    return NextResponse.json({ codigo: tiempo ? "api_sin_respuesta" : "api_caida", mensaje }, { status: tiempo ? 504 : 502 });
  }
  const res = new NextResponse(r.status === 204 ? null : await r.text(), {
    status: r.status,
    headers: { "Content-Type": r.headers.get("Content-Type") ?? "application/json" },
  });
  if (nueva) guardarSesion(res, nueva, recordar);
  return res;
}

type Ctx = { params: Promise<{ ruta: string[] }> };
export async function GET(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
export async function POST(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
export async function PUT(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
export async function PATCH(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
export async function DELETE(req: NextRequest, c: Ctx) { return reenviar(req, (await c.params).ruta); }
