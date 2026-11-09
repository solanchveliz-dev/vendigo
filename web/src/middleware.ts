import { NextResponse, type NextRequest } from "next/server";

// El panel del vendedor y el del administrador solo se abren con sesión.
export function middleware(req: NextRequest) {
  if (!req.cookies.get("vg_rt")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/ingresar";
    url.searchParams.set("siguiente", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/vendedor/:path*", "/admin/:path*", "/admin"] };
