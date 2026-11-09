"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { BadgeCheck, Banknote, FileClock, LayoutDashboard, LogOut, ShieldAlert, Users } from "lucide-react";
import { sesion, useApi } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { Cargando, cn } from "@/components/ui";

type Resumen = { verificaciones_pendientes: number; retiros_pendientes: number; reclamos_abiertos: number };

const menu = [
  { href: "/admin", texto: "Resumen", icono: LayoutDashboard },
  { href: "/admin/vendedoras", texto: "Vendedoras", icono: Users },
  { href: "/admin/identidades", texto: "Identidades", icono: BadgeCheck, cuenta: "verificaciones_pendientes" as const },
  { href: "/admin/retiros", texto: "Retiros", icono: Banknote, cuenta: "retiros_pendientes" as const },
  { href: "/admin/reclamos", texto: "Reclamos", icono: ShieldAlert, cuenta: "reclamos_abiertos" as const },
  { href: "/admin/auditoria", texto: "Auditoría", icono: FileClock },
];

// Panel del administrador. Solo entra una cuenta con rol admin (la API también lo exige).
export default function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const yo = useApi<Usuario>("/me");
  const { datos: r } = useApi<Resumen>(yo.datos?.rol === "admin" ? `/admin/resumen?${ruta}` : null);

  useEffect(() => {
    if (yo.datos && yo.datos.rol !== "admin") router.replace("/vendedor");
  }, [yo.datos, router]);

  // Cierre de sesión tras 30 minutos sin actividad (la API también lo exige al renovar la sesión).
  const ultimaActividad = useRef(Date.now());
  useEffect(() => {
    const marcar = () => (ultimaActividad.current = Date.now());
    const eventos = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }));
    const t = setInterval(async () => {
      if (Date.now() - ultimaActividad.current > 30 * 60 * 1000) {
        clearInterval(t);
        await sesion("salir").catch(() => null);
        window.location.href = "/ingresar?inactiva=1&siguiente=/admin";
      }
    }, 20_000);
    return () => {
      clearInterval(t);
      eventos.forEach((e) => window.removeEventListener(e, marcar));
    };
  }, []);

  if (!yo.datos || yo.datos.rol !== "admin") return <div className="p-10"><Cargando /></div>;

  async function salir() {
    await sesion("salir").catch(() => null);
    router.replace("/ingresar");
  }
  const activo = (h: string) => (h === "/admin" ? ruta === h : ruta.startsWith(h));

  return (
    <div className="min-h-screen md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col bg-pino p-5 text-white md:flex">
        <Link href="/admin" className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white p-1">
            <Image src="/logo.png" alt="" width={36} height={36} />
          </span>
          <span>
            <b className="block font-display text-lg leading-none">VendiGo</b>
            <span className="text-xs text-white/60">Administración</span>
          </span>
        </Link>
        <nav className="flex-1 space-y-1">
          {menu.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition", activo(m.href) ? "bg-white text-pino" : "text-white/80 hover:bg-white/10")}
            >
              <m.icono className="size-[18px]" />
              <span className="flex-1">{m.texto}</span>
              {m.cuenta && r && r[m.cuenta] > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-white">{r[m.cuenta]}</span>}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 pt-4 text-sm">
          <b className="block">{yo.datos.nombre}</b>
          <span className="text-xs text-white/60">Administrador</span>
          <button onClick={salir} className="mt-3 flex items-center gap-2 text-white/80 hover:text-white">
            <LogOut className="size-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Menú en celular */}
      <div className="sticky top-0 z-40 flex gap-1 overflow-x-auto bg-pino px-3 py-2 md:hidden">
        {menu.map((m) => (
          <Link key={m.href} href={m.href} className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold", activo(m.href) ? "bg-white text-pino" : "text-white/80")}>
            {m.texto}
          </Link>
        ))}
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
