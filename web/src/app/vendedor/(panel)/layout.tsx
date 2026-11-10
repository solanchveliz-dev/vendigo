"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Bell, ClipboardList, Crown, Home, LogOut, MessageCircleQuestion, Package, ShieldCheck, Sparkles, Store, Wallet, Smartphone, Search, Share2, Plus, Users, Settings } from "lucide-react";
import { api, sesion, useApi } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { cn, Cargando } from "@/components/ui";
import { PanelCtx, type Resumen } from "@/components/panel/contexto";
import { PanelDemo } from "@/components/panel/demo";

const menu = [
  { href: "/vendedor", texto: "Inicio", icono: Home },
  { href: "/vendedor/pedidos", texto: "Pedidos", icono: ClipboardList, cuenta: "pedidos" },
  { href: "/vendedor/productos", texto: "Productos", icono: Package },
  { href: "/vendedor/clientes", texto: "Clientes", icono: Users },
  { href: "/vendedor/consultas", texto: "Consultas", icono: MessageCircleQuestion, cuenta: "consultas" },
  { href: "/vendedor/cobros", texto: "Mis ventas", icono: Wallet, cuenta: "reclamos" },
  { href: "/vendedor/analitica", texto: "Analítica", icono: BarChart3 },
  { href: "/vendedor/ia", texto: "Herramientas IA", icono: Sparkles },
  { href: "/vendedor/tienda", texto: "Mi tienda", icono: Store },
  { href: "/vendedor/plan", texto: "Plan y ventas", icono: Crown },
  { href: "/vendedor/configuracion", texto: "Configuración", icono: Settings },
];

function iniciales(n: string) {
  return n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// En el celular la barra de abajo tiene solo lo más usado; el resto está en "Mi tienda".
const barraMovil = ["/vendedor", "/vendedor/pedidos", "/vendedor/productos", "/vendedor/cobros", "/vendedor/tienda"];

export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const yo = useApi<Usuario>("/me");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [menuCuenta, setMenuCuenta] = useState(false);

  const recargarResumen = useCallback(() => {
    api.get<Resumen>("/vendedor/resumen").then(setResumen).catch(() => null);
  }, []);

  useEffect(() => {
    if (yo.datos && !yo.datos.tienda_id) router.replace("/vendedor/crear-tienda");
    if (yo.datos?.tienda_id) recargarResumen();
  }, [yo.datos, router, recargarResumen]);

  useEffect(() => {
    if (yo.datos?.tienda_id) recargarResumen();
  }, [ruta, yo.datos?.tienda_id, recargarResumen]);

  if (!yo.datos?.tienda_id) return <div className="px-6"><Cargando /></div>;

  const cuentas: Record<string, number> = {
    pedidos: (resumen?.pedidos.por_aceptar ?? 0) + (resumen?.pedidos.por_enviar ?? 0) + (resumen?.pedidos.recogen ?? 0),
    consultas: (resumen?.preguntas_pendientes ?? 0) + (resumen?.ayudas_abiertas ?? 0),
    reclamos: resumen?.reclamos_abiertos ?? 0,
  };
  const activo = (href: string) => (href === "/vendedor" ? ruta === href : ruta.startsWith(href));

  async function salir() {
    await sesion("salir").catch(() => null);
    router.replace("/ingresar");
  }

  return (
    <PanelCtx.Provider value={{ usuario: yo.datos, resumen, recargarResumen }}>
      {/* Barra lateral de íconos (escritorio). El nombre aparece encima del contenido al pasar el mouse. */}
      <aside className="no-imprimir fixed inset-y-3 left-3 z-[200] hidden w-[72px] flex-col items-center rounded-2xl bg-white py-4 shadow-suave ring-1 ring-linea/60 md:flex">
        <Link href="/vendedor" className="mb-5">
          <Image src="/logo.png" alt="VendiGo" width={40} height={40} />
        </Link>
        <nav className="flex flex-1 flex-col gap-1.5">
          {menu.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={cn(
                "group relative grid size-11 place-items-center rounded-xl transition",
                activo(m.href) ? "bg-coral text-white" : "text-gris hover:bg-pino-claro hover:text-pino",
              )}
              aria-label={m.texto}
            >
              <m.icono className="size-5" />
              {m.cuenta && cuentas[m.cuenta] > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-pino px-1 text-[11px] font-bold text-white ring-2 ring-white">
                  {cuentas[m.cuenta]}
                </span>
              )}
              <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg bg-pino px-3 py-1.5 text-sm font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                {m.texto}
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="md:pl-[96px]">
        <header className="no-imprimir sticky top-0 z-[150] flex h-16 items-center justify-between gap-3 bg-crema/90 px-4 backdrop-blur md:px-6">
          <Link href="/vendedor" className="flex items-center gap-2 md:hidden">
            <Image src="/logo.png" alt="" width={32} height={32} />
            <span className="font-display text-lg font-extrabold text-pino">VendiGo</span>
          </Link>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
              router.push(`/vendedor/pedidos?q=${encodeURIComponent(q)}`);
            }}
            className="relative hidden w-full max-w-sm md:block"
          >
            <Search className="absolute left-3.5 top-3 size-4 text-gris" />
            <input name="q" placeholder="Buscar pedidos, productos o clientes…" className="h-10 w-full rounded-full bg-white pl-10 pr-4 text-sm outline-none ring-1 ring-linea focus:ring-pino/40" />
          </form>
          <div className="flex items-center gap-2">
            <Link href="/vendedor/tienda/compartir" className="hidden h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-pino ring-1 ring-linea lg:inline-flex">
              <Share2 className="size-4" /> Compartir tienda
            </Link>
            <Link href="/vendedor/productos/nuevo" className="hidden h-10 items-center gap-1 rounded-full bg-coral px-4 text-sm font-semibold text-white sm:inline-flex">
              <Plus className="size-4" /> Nuevo producto
            </Link>
            <Link href="/vendedor/notificaciones" className="relative grid size-10 place-items-center rounded-full bg-white ring-1 ring-linea" aria-label="Notificaciones">
              <Bell className="size-5 text-pino" />
              {(resumen?.notificaciones_no_leidas ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] font-bold text-white">
                  {resumen?.notificaciones_no_leidas}
                </span>
              )}
            </Link>
            <div className="relative">
              <button onClick={() => setMenuCuenta(!menuCuenta)} className="grid size-10 place-items-center rounded-full bg-pino text-sm font-bold text-white">
                {iniciales(yo.datos.nombre)}
              </button>
              {menuCuenta && (
                <div className="absolute right-0 top-12 w-64 rounded-xl bg-white p-2 shadow-suave ring-1 ring-linea" onClick={() => setMenuCuenta(false)}>
                  <div className="px-3 py-2">
                    <p className="font-semibold">{yo.datos.nombre}</p>
                    <p className="text-sm text-gris">{yo.datos.celular}</p>
                  </div>
                  <Link href="/vendedor/tienda/pagos" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-crema">
                    <Smartphone className="size-4" /> Cómo te pagan
                  </Link>
                  <Link href="/vendedor/verificacion" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-crema">
                    <ShieldCheck className="size-4" /> Verificar identidad
                  </Link>
                  <Link href="/vendedor/configuracion" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-crema">
                    <Settings className="size-4" /> Configuración
                  </Link>
                  <button onClick={salir} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-error hover:bg-error-claro">
                    <LogOut className="size-4" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-2 md:px-6 md:pb-12">{children}</main>
      </div>

      {/* Barra de abajo (celular) */}
      <nav className="no-imprimir fixed inset-x-3 bottom-3 z-[200] flex justify-around rounded-2xl bg-white py-2 shadow-suave ring-1 ring-linea md:hidden">
        {menu
          .filter((m) => barraMovil.includes(m.href))
          .map((m) => (
            <Link key={m.href} href={m.href} className={cn("relative flex flex-col items-center gap-0.5 px-2 text-[11px] font-semibold", activo(m.href) ? "text-coral" : "text-gris")}>
              <m.icono className="size-5" />
              {m.texto}
              {m.cuenta && cuentas[m.cuenta] > 0 && <span className="absolute -top-1 right-1 size-2 rounded-full bg-coral" />}
            </Link>
          ))}
      </nav>
      {process.env.NEXT_PUBLIC_DEMO === "1" && <PanelDemo />}
    </PanelCtx.Provider>
  );
}
