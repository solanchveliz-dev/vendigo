"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, Bell, ClipboardList, Crown, Home, LogOut, MessageCircleQuestion, Package, Radio, ShieldCheck, Sparkles, Store, Wallet, Smartphone, Search, Share2, Plus, Users, Settings } from "lucide-react";
import { api, sesion, useApi } from "@/lib/api";
import type { Tienda, Usuario, UsoPlan } from "@/lib/tipos";
import { cn, Cargando } from "@/components/ui";
import { PanelCtx, type Resumen } from "@/components/panel/contexto";
import { PanelDemo } from "@/components/panel/demo";
import { ErrorCarga } from "@/components/error-carga";
import { BotonRiel, margenContenido, PieRiel, Riel, useRiel } from "@/components/panel/riel";

const menu = [
  { href: "/vendedor", texto: "Inicio", icono: Home },
  { href: "/vendedor/pedidos", texto: "Pedidos", icono: ClipboardList, cuenta: "pedidos" },
  { href: "/vendedor/productos", texto: "Productos", icono: Package },
  { href: "/vendedor/live", texto: "Modo live", icono: Radio },
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
  const riel = useRiel();
  const conTienda = !!yo.datos?.tienda_id;
  const tienda = useApi<Tienda>(conTienda ? "/vendedor/tienda" : null);
  const plan = useApi<UsoPlan>(conTienda ? "/vendedor/plan" : null);

  const recargarResumen = useCallback(() => {
    api.get<Resumen>("/vendedor/resumen").then(setResumen).catch(() => null);
  }, []);

  useEffect(() => {
    // Un administrador no usa el panel de vendedora: vuelve a su panel.
    if (yo.datos?.rol === "admin") {
      router.replace("/admin");
      return;
    }
    // Sin tienda todavía: la crea dentro del panel (los demás menús se activan al crearla).
    if (yo.datos && !yo.datos.tienda_id && ruta !== "/vendedor/crear-tienda") router.replace("/vendedor/crear-tienda");
    if (yo.datos?.tienda_id) recargarResumen();
  }, [yo.datos, router, recargarResumen, ruta]);

  useEffect(() => {
    if (yo.datos?.tienda_id) recargarResumen();
  }, [ruta, yo.datos?.tienda_id, recargarResumen]);

  const sinTienda = !!yo.datos && !yo.datos.tienda_id;
  if (!yo.datos || yo.datos.rol === "admin" || (sinTienda && ruta !== "/vendedor/crear-tienda")) return <div className="px-6"><Cargando /></div>;

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
      <Riel
        abierto={riel.abierto}
        inicio="/vendedor"
        subtitulo="Panel del emprendedor"
        items={menu.map((m) => ({ href: m.href, texto: m.texto, icono: m.icono, cuenta: m.cuenta ? cuentas[m.cuenta] : 0 }))}
        activo={activo}
        deshabilitado={sinTienda}
        pie={
          !sinTienda && (
            <PieRiel
              abierto={riel.abierto}
              imagen={tienda.datos?.logo_url || undefined}
              iniciales={iniciales(tienda.datos?.nombre || yo.datos.nombre)}
              titulo={tienda.datos?.nombre || yo.datos.nombre}
              linea={plan.datos ? `Plan ${plan.datos.plan.nombre}` : "Tu tienda"}
            />
          )
        }
      />

      <div className={cn("transition-[padding] duration-300", margenContenido(riel.abierto))}>
        <header className="no-imprimir sticky top-0 z-[150] flex h-16 items-center justify-between gap-3 border-b border-linea bg-white/90 px-4 backdrop-blur md:h-[74px] md:justify-start md:gap-4 md:py-3.5 md:pl-6 md:pr-7 xl:pr-9">
          <BotonRiel onClick={riel.alternar} />
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
            className="relative hidden min-w-0 flex-1 md:block md:max-w-[560px]"
          >
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-tinta" />
            <input name="q" placeholder="Buscar pedidos, productos o clientes…" className="h-[46px] w-full rounded-full bg-[#ece9e2] pl-12 pr-4 text-[15px] outline-none focus:ring-2 focus:ring-pino/30" />
          </form>
          <div className={`flex items-center gap-2 md:ml-auto md:gap-3 ${sinTienda ? "invisible" : ""}`}>
            <Link href="/vendedor/tienda/compartir" className="hidden h-9 items-center gap-2 rounded-full border border-linea bg-white px-3.5 text-[13.5px] font-bold text-tinta lg:inline-flex">
              <Share2 className="size-4" /> Compartir tienda
            </Link>
            <Link href="/vendedor/productos/nuevo" className={`hidden h-9 items-center gap-2 rounded-full bg-coral px-3.5 text-[13.5px] font-bold text-white ${ruta === "/vendedor/productos" ? "" : "sm:inline-flex"}`}>
              <Plus className="size-4" /> Nuevo producto
            </Link>
            <Link href="/vendedor/notificaciones" className="relative grid size-10 place-items-center rounded-full border border-linea bg-white md:size-11" aria-label="Notificaciones">
              <Bell className="size-5 text-pino" />
              {(resumen?.notificaciones_no_leidas ?? 0) > 0 && (
                <span className="absolute -right-[3px] -top-[3px] grid h-[19px] min-w-[19px] place-items-center rounded-full border-2 border-white bg-coral px-1 text-[11px] font-bold text-white">
                  {resumen?.notificaciones_no_leidas}
                </span>
              )}
            </Link>
            <div className="relative">
              <button onClick={() => setMenuCuenta(!menuCuenta)} className="grid size-10 place-items-center rounded-full border border-linea bg-white md:size-11" aria-label="Mi cuenta">
                <span className="grid size-8 place-items-center rounded-full bg-pino text-xs font-bold text-white">{iniciales(yo.datos.nombre)}</span>
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
        <main className="px-4 pb-28 pt-4 md:px-10 md:pb-16 md:pt-7">
          <div className="mb-4 empty:mb-0"><ErrorCarga /></div>
          {children}
        </main>
      </div>

      {/* Barra de abajo (celular) */}
      <nav className={`no-imprimir fixed inset-x-3 bottom-3 z-[200] flex justify-around rounded-2xl bg-white py-2 shadow-suave ring-1 ring-linea md:hidden ${sinTienda ? "pointer-events-none opacity-40" : ""}`}>
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
