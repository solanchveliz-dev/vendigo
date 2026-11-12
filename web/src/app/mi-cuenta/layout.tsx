"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Home, LogOut, Search, ShoppingBag, Store, User } from "lucide-react";
import { sesion, useApi } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { Cargando, cn } from "@/components/ui";
import { iniciales } from "@/components/comprador/ui";
import { BotonRiel, margenContenido, PieRiel, Riel, useRiel } from "@/components/panel/riel";

// Menú del comprador (como el prototipo). Favoritos, direcciones y notificaciones se suman en la siguiente fase.
const menu = [
  { href: "/mi-cuenta", texto: "Inicio", icono: Home },
  { href: "/buscar", texto: "Buscar emprendedores", icono: Search },
  { href: "/mi-cuenta/pedidos", texto: "Mis pedidos", icono: ShoppingBag },
  { href: "/mi-cuenta/perfil", texto: "Perfil", icono: User },
];
const arriba = [
  { href: "/mi-cuenta", texto: "Inicio" },
  { href: "/buscar", texto: "Explorar" },
  { href: "/mi-cuenta/pedidos", texto: "Mis pedidos" },
];

export default function LayoutComprador({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const yo = useApi<Usuario>("/me");
  const riel = useRiel();
  const [menuCuenta, setMenuCuenta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (yo.datos?.rol === "admin") router.replace("/admin");
  }, [yo.datos, router]);
  useEffect(() => {
    const cerrar = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setMenuCuenta(false);
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);
  useEffect(() => setMenuCuenta(false), [ruta]);

  if (!yo.datos || yo.datos.rol === "admin") return <div className="p-10"><Cargando /></div>;
  const u = yo.datos;
  const activo = (h: string) => (h === "/mi-cuenta" ? ruta === h : ruta.startsWith(h));
  const vende = u.rol === "vendedor";

  async function salir() {
    await sesion("salir").catch(() => null);
    router.replace("/ingresar");
  }

  return (
    <div className="min-h-screen bg-crema">
      <Riel
        abierto={riel.abierto}
        inicio="/mi-cuenta"
        subtitulo="Mi cuenta"
        items={menu}
        activo={activo}
        pie={
          vende ? (
            <PieRiel abierto={riel.abierto} iniciales={iniciales(u.nombre)} titulo={u.nombre} linea="Compradora y vendedora" />
          ) : riel.abierto ? (
            <div className="rounded-2xl bg-pino-claro/60 p-3.5">
              <b className="block text-sm text-tinta">¿Tienes un emprendimiento?</b>
              <p className="mt-0.5 text-xs text-gris">Tu tienda, en un solo lugar. Empieza gratis.</p>
              <Link href="/vendedor/crear-tienda" className="mt-2.5 inline-flex h-9 items-center rounded-full bg-coral px-4 text-[13px] font-bold text-white">Crear mi tienda</Link>
            </div>
          ) : (
            <PieRiel abierto={false} iniciales={iniciales(u.nombre)} titulo={u.nombre} linea="Comprador" />
          )
        }
      />

      <div className={cn("transition-[padding] duration-300", margenContenido(riel.abierto))}>
        <header className="sticky top-0 z-[150] flex h-[74px] items-center gap-4 border-b border-linea bg-white/90 px-4 py-3.5 backdrop-blur md:pl-6 md:pr-7 xl:pr-9">
          <BotonRiel onClick={riel.alternar} />
          <nav className="hidden items-center gap-1 lg:flex">
            {arriba.map((l) => (
              <Link key={l.href} href={l.href} className={cn("rounded-full px-3.5 py-2 text-[14.5px] font-semibold transition", activo(l.href) ? "bg-pino-claro text-pino" : "text-gris hover:text-tinta")}>
                {l.texto}
              </Link>
            ))}
          </nav>
          <form action="/buscar" className="relative min-w-0 flex-1 md:max-w-[520px]">
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-tinta" />
            <input name="q" placeholder="¿Qué buscas? Ej. alfajores, joyería, polos…" className="h-[46px] w-full rounded-full bg-[#ece9e2] pl-12 pr-24 text-[15px] outline-none focus:ring-2 focus:ring-pino/30" />
            <button className="absolute right-1.5 top-1/2 h-[34px] -translate-y-1/2 rounded-full bg-pino px-4 text-[13px] font-bold text-white">Buscar</button>
          </form>
          <div ref={caja} className="relative ml-auto">
            <button onClick={() => setMenuCuenta(!menuCuenta)} className="flex items-center gap-2 rounded-full border border-linea bg-white py-1 pl-1 pr-3" aria-label="Mi cuenta">
              <span className="grid size-9 place-items-center rounded-full bg-pino text-sm font-bold text-white">{iniciales(u.nombre)}</span>
              <b className="hidden text-sm text-tinta sm:block">{u.nombre.split(" ")[0]}</b>
              <ChevronDown className="size-4 text-gris" />
            </button>
            {menuCuenta && (
              <div className="absolute right-0 top-14 w-60 rounded-2xl bg-white p-2 shadow-suave ring-1 ring-linea">
                <Opcion href="/mi-cuenta/perfil" icono={User}>Mi perfil</Opcion>
                <Opcion href="/mi-cuenta/pedidos" icono={ShoppingBag}>Mis pedidos</Opcion>
                <Opcion href={vende ? "/vendedor" : "/vendedor/crear-tienda"} icono={Store} acento>{vende ? "Ir a mi tienda" : "Crear mi tienda"}</Opcion>
                <button onClick={salir} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-gris hover:bg-crema hover:text-tinta">
                  <LogOut className="size-4" /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="w-full px-4 pb-16 pt-7 md:px-10">{children}</main>
      </div>
    </div>
  );
}

function Opcion({ href, icono: Icono, acento, children }: { href: string; icono: typeof User; acento?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-crema", acento ? "text-coral" : "text-tinta")}>
      <Icono className="size-4" /> {children}
    </Link>
  );
}
