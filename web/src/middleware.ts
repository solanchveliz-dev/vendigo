import { NextResponse, type NextRequest } from "next/server";

// Roles separados en la web (la API además los exige en cada ruta y registra los intentos):
//   · admin: solo /admin (no puede tener tienda ni entrar al panel de vendedora).
//   · vendedor: /vendedor (sin acceso a /admin).
//   · comprador con cuenta: puede ir a /vendedor/crear-tienda para empezar a vender (pasa a vendedor).
// Los compradores no necesitan cuenta: compran con un código por SMS y siguen su pedido con un enlace.

// Rol guardado en el token de acceso. Solo sirve para redirigir rápido; la seguridad real la pone la API.
function rolDeSesion(req: NextRequest): string | null {
  const token = req.cookies.get("vg_at")?.value;
  const parte = token?.split(".")[1];
  if (!parte) return null;
  try {
    const datos = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(parte.length / 4) * 4, "=")));
    if (typeof datos.exp === "number" && datos.exp * 1000 < Date.now()) return null; // vencido: lo renueva la página
    return typeof datos.rol === "string" ? datos.rol : null;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const ruta = req.nextUrl.pathname;
  if (!req.cookies.get("vg_rt")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/ingresar";
    url.search = "";
    url.searchParams.set("siguiente", ruta);
    return NextResponse.redirect(url);
  }
  const rol = rolDeSesion(req);
  if (rol) {
    const esAdmin = ruta === "/admin" || ruta.startsWith("/admin/");
    if (esAdmin && rol !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/acceso-denegado";
      url.search = "";
      url.searchParams.set("desde", ruta);
      return NextResponse.redirect(url);
    }
    if (!esAdmin && rol === "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/vendedor/:path*", "/admin/:path*", "/admin"] };
