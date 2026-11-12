"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, Download, Flag, Home, LogOut, Search, ShieldCheck, Briefcase, Users, Store, Package, ShoppingBag, CreditCard, Crown, BarChart3, AlertTriangle, MapPin, Settings, BookOpen, LifeBuoy } from "lucide-react";
import { api, sesion, useApi } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { Cargando, cn } from "@/components/ui";
import { fechaHora } from "@/lib/admin";
import { ErrorCarga } from "@/components/error-carga";
import { BotonRiel, margenContenido, PieRiel, Riel, useRiel } from "@/components/panel/riel";

type Resumen = { verificaciones_pendientes: number; pagos_plan_pendientes: number; reclamos_abiertos: number; incidencias_abiertas: number };
type Aviso = { id: string; titulo: string; cuerpo: string; enlace: string; leida: boolean; creado_en: string };

// Menú del panel admin (mismo orden e íconos del prototipo). Las secciones restantes se suman en las siguientes fases.
const menu = [
  { href: "/admin", texto: "Inicio", icono: Home },
  { href: "/admin/usuarios", texto: "Usuarios", icono: Users },
  { href: "/admin/vendedores", texto: "Vendedores", icono: Briefcase, cuenta: "verificaciones_pendientes" as const },
  { href: "/admin/tiendas", texto: "Tiendas", icono: Store },
  { href: "/admin/productos", texto: "Productos", icono: Package },
  { href: "/admin/pedidos", texto: "Pedidos", icono: ShoppingBag },
  { href: "/admin/pagos", texto: "Pagos", icono: CreditCard },
  { href: "/admin/agencias", texto: "Agencias", icono: MapPin },
  { href: "/admin/suscripciones", texto: "Suscripciones", icono: Crown, cuenta: "pagos_plan_pendientes" as const },
  { href: "/admin/reportes", texto: "Reportes", icono: BarChart3 },
  { href: "/admin/incidencias", texto: "Incidencias", icono: AlertTriangle, cuenta: "incidencias_abiertas" as const },
  { href: "/admin/reclamos", texto: "Reclamos", icono: Flag, cuenta: "reclamos_abiertos" as const },
  { href: "/admin/fondo", texto: "Fondo de emergencia", icono: LifeBuoy },
  { href: "/admin/libro", texto: "Libro de Reclamaciones", icono: BookOpen },
  { href: "/admin/seguridad", texto: "Seguridad", icono: ShieldCheck },
  { href: "/admin/configuracion", texto: "Configuración", icono: Settings },
];

export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const yo = useApi<Usuario>("/me");
  const esAdmin = yo.datos?.rol === "admin";
  const { datos: r } = useApi<Resumen>(esAdmin ? `/admin/resumen?${ruta}` : null);
  const riel = useRiel();
  const [campana, setCampana] = useState(false);
  const avisos = useApi<{ notificaciones: Aviso[] }>(esAdmin ? `/admin/notificaciones?r=${campana}` : null);
  const noLeidas = avisos.datos?.notificaciones.filter((a) => !a.leida).length ?? 0;

  useEffect(() => {
    if (yo.datos && yo.datos.rol !== "admin") {
      // Queda registrado como intento de acceso denegado (la API responde 403).
      api.get("/admin/resumen").catch(() => null);
      router.replace(`/acceso-denegado?desde=${encodeURIComponent(ruta)}`);
    }
  }, [yo.datos, router]);

  // Cierre de sesión por inactividad (los minutos se configuran en Seguridad; la API también lo exige).
  const ultima = useRef(Date.now());
  const limite = useApi<{ inactividad_min: number }>(esAdmin ? "/admin/seguridad" : null);
  useEffect(() => {
    const marcar = () => (ultima.current = Date.now());
    const ev = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    ev.forEach((e) => window.addEventListener(e, marcar, { passive: true }));
    const t = setInterval(async () => {
      const min = limite.datos?.inactividad_min ?? 30;
      if (Date.now() - ultima.current > min * 60 * 1000) {
        clearInterval(t);
        await sesion("salir").catch(() => null);
        window.location.href = "/ingresar?inactiva=1&siguiente=/admin";
      }
    }, 20_000);
    return () => {
      clearInterval(t);
      ev.forEach((e) => window.removeEventListener(e, marcar));
    };
  }, [limite.datos?.inactividad_min]);

  if (!esAdmin) return <div className="p-10"><Cargando /></div>;

  async function salir() {
    await sesion("salir").catch(() => null);
    router.replace("/ingresar");
  }
  async function abrirCampana() {
    setCampana(!campana);
    if (!campana && noLeidas) await api.get("/admin/notificaciones?marcar=1").catch(() => null);
  }
  const activo = (h: string) => (h === "/admin" ? ruta === h : ruta.startsWith(h));
  const iniciales = yo.datos!.nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-crema">
      <Riel
        abierto={riel.abierto}
        inicio="/admin"
        subtitulo="Panel de administración"
        items={menu.map((m) => ({ href: m.href, texto: m.texto, icono: m.icono, cuenta: m.cuenta && r ? r[m.cuenta] : 0 }))}
        activo={activo}
        pie={<PieRiel abierto={riel.abierto} iniciales={iniciales} titulo={yo.datos!.nombre} linea="Administrador" />}
      />

      <div className={cn("transition-[padding] duration-300", margenContenido(riel.abierto))}>
        <header className="sticky top-0 z-[150] flex h-[74px] items-center gap-4 border-b border-linea bg-white/90 px-4 py-3.5 backdrop-blur md:pl-6 md:pr-7 xl:pr-9">
          <BotonRiel onClick={riel.alternar} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q")?.toString().trim() ?? "";
              router.push(`/admin/usuarios?q=${encodeURIComponent(q)}`);
            }}
            className="relative min-w-0 flex-1 md:max-w-[560px]"
          >
            <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-tinta" />
            <input name="q" placeholder="Buscar usuarios, tiendas, pedidos o transacciones…" className="h-[46px] w-full rounded-full bg-[#ece9e2] pl-12 pr-4 text-[15px] outline-none focus:ring-2 focus:ring-pino/30" />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => window.dispatchEvent(new Event("vg:exportar"))} className="hidden h-9 items-center gap-2 rounded-full border border-linea bg-white px-3.5 text-[13.5px] font-bold text-tinta sm:inline-flex">
              <Download className="size-4" /> Exportar
            </button>
            <div className="relative">
              <button onClick={abrirCampana} className="relative grid size-11 place-items-center rounded-full border border-linea bg-white" aria-label="Notificaciones">
                <Bell className="size-5 text-pino" />
                {noLeidas > 0 && <span className="absolute -right-[3px] -top-[3px] grid h-[19px] min-w-[19px] place-items-center rounded-full border-2 border-white bg-coral px-1 text-[11px] font-bold text-white">{noLeidas}</span>}
              </button>
              {campana && (
                <div className="absolute right-0 top-14 w-80 rounded-2xl bg-white p-2 shadow-suave ring-1 ring-linea">
                  {!avisos.datos?.notificaciones.length ? (
                    <p className="p-3 text-sm text-gris">No tienes avisos.</p>
                  ) : (
                    avisos.datos.notificaciones.slice(0, 6).map((a) => (
                      <Link key={a.id} href={a.enlace || "/admin"} onClick={() => setCampana(false)} className="block rounded-xl px-3 py-2.5 hover:bg-crema">
                        <b className="block text-sm text-tinta">{a.titulo}</b>
                        <span className="block text-xs text-gris">{a.cuerpo}</span>
                        <span className="text-[11px] text-gris">{fechaHora(a.creado_en)}</span>
                      </Link>
                    ))
                  )}
                  <Link href="/admin/notificaciones" onClick={() => setCampana(false)} className="mt-1 block rounded-xl px-3 py-2 text-center text-sm font-bold text-pino hover:bg-crema">Ver todas</Link>
                </div>
              )}
            </div>
            <button onClick={salir} className="grid size-11 place-items-center rounded-full border border-linea bg-white" aria-label="Cerrar sesión">
              <LogOut className="size-5 text-pino" />
            </button>
          </div>
        </header>

        {/* Menú en celular */}
        <nav className="sticky top-[74px] z-40 flex gap-1 overflow-x-auto bg-crema px-3 py-2 md:hidden">
          {menu.map((m) => (
            <Link key={m.href} href={m.href} className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold", activo(m.href) ? "bg-coral text-white" : "bg-white text-tinta ring-1 ring-linea")}>{m.texto}</Link>
          ))}
        </nav>

        <main className="space-y-6 px-4 pb-16 pt-7 md:px-10">
          <ErrorCarga />
          {children}
        </main>
      </div>
    </div>
  );
}
