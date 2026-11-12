"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/components/ui";

// Barra lateral del panel como en el prototipo: recogida (solo íconos, 84 px) o desplegada con nombres (260 px).
// El botón de cuadritos de la barra superior la abre y la cierra; la preferencia se recuerda en este navegador.

export type ItemRiel = { href: string; texto: string; icono: LucideIcon; cuenta?: number };

const CLAVE = "vg:riel-abierto";

export function useRiel() {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => {
    try {
      setAbierto(localStorage.getItem(CLAVE) === "1");
    } catch {
      /* sin almacenamiento: queda recogida */
    }
  }, []);
  const alternar = () =>
    setAbierto((a) => {
      try {
        localStorage.setItem(CLAVE, a ? "0" : "1");
      } catch {
        /* nada */
      }
      return !a;
    });
  return { abierto, alternar };
}

// Margen izquierdo del contenido según el estado de la barra (barra + 12 px de margen a cada lado).
export const margenContenido = (abierto: boolean) => (abierto ? "md:pl-[272px]" : "md:pl-[96px]");

export function BotonRiel({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hidden size-11 shrink-0 place-items-center rounded-full border border-linea bg-white text-tinta transition hover:bg-crema md:grid"
      aria-label="Mostrar u ocultar el menú"
      title="Mostrar u ocultar el menú"
    >
      <LayoutGrid className="size-5" />
    </button>
  );
}

export function Riel({
  abierto,
  inicio,
  subtitulo,
  items,
  activo,
  deshabilitado,
  pie,
}: {
  abierto: boolean;
  inicio: string;
  subtitulo: string;
  items: ItemRiel[];
  activo: (href: string) => boolean;
  deshabilitado?: boolean;
  pie?: React.ReactNode;
}) {
  // Nombre al pasar el mouse con la barra recogida: se dibuja fijo para que el desplazamiento del menú no lo corte.
  const [etiqueta, setEtiqueta] = useState<{ texto: string; top: number } | null>(null);

  return (
    <aside
      className={cn(
        "no-imprimir fixed bottom-3 left-3 top-3 z-[200] hidden flex-col rounded-[26px] border border-linea bg-white px-3 py-4 shadow-[0_18px_40px_-30px_rgba(16,59,56,0.6)] transition-[width] duration-300 md:flex",
        abierto ? "w-[260px]" : "w-[84px]",
      )}
    >
      <Link href={inicio} className={cn("mb-3.5 flex shrink-0 items-center gap-2", abierto ? "justify-start pl-2" : "justify-center")}>
        <Image src="/logo.png" alt="VendiGo" width={40} height={40} className="shrink-0" />
        {abierto && (
          <span className="min-w-0 leading-tight">
            <b className="block font-display text-[22px] font-extrabold tracking-tight text-tinta">
              Vendi<span className="text-coral">Go</span>
            </b>
            <span className="block truncate text-[11px] font-semibold text-gris">{subtitulo}</span>
          </span>
        )}
      </Link>

      <nav
        className={cn("-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-1 py-1 [scrollbar-width:thin]", deshabilitado && "pointer-events-none opacity-40")}
        aria-disabled={deshabilitado}
        onScroll={() => setEtiqueta(null)}
      >
        {items.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            aria-label={m.texto}
            onMouseEnter={(e) => {
              if (abierto) return;
              const r = e.currentTarget.getBoundingClientRect();
              setEtiqueta({ texto: m.texto, top: r.top + r.height / 2 });
            }}
            onMouseLeave={() => setEtiqueta(null)}
            onClick={() => setEtiqueta(null)}
            className={cn(
              "relative flex h-12 shrink-0 items-center rounded-2xl transition",
              abierto ? "w-full justify-start gap-3 px-3.5" : "mx-auto w-[52px] justify-center",
              activo(m.href) ? "bg-coral text-white shadow-[0_10px_20px_-12px_rgba(243,107,80,0.9)]" : "text-gris hover:bg-pino-claro hover:text-tinta",
            )}
          >
            <m.icono className="size-5 shrink-0" />
            {abierto && <span className="truncate text-[15px] font-semibold">{m.texto}</span>}
            {!!m.cuenta && m.cuenta > 0 && (
              <span
                className={cn(
                  "grid h-[18px] min-w-[18px] place-items-center rounded-full bg-pino px-[5px] text-[10.5px] font-bold leading-none text-white",
                  abierto ? "ml-auto" : "absolute right-1 top-1",
                )}
              >
                {m.cuenta}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {etiqueta && !abierto && (
        <span
          className="pointer-events-none fixed left-[108px] z-[300] -translate-y-1/2 whitespace-nowrap rounded-[10px] bg-pino px-3 py-[7px] text-[13px] font-bold text-white shadow-lg"
          style={{ top: etiqueta.top }}
        >
          {etiqueta.texto}
        </span>
      )}

      {pie && <div className="mt-auto shrink-0 pt-4">{pie}</div>}
    </aside>
  );
}

// Pie de la barra: logo o iniciales + nombre y una línea (solo con la barra desplegada).
export function PieRiel({ abierto, imagen, iniciales, titulo, linea }: { abierto: boolean; imagen?: string; iniciales: string; titulo: string; linea: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl", abierto ? "bg-pino-claro/60 p-2.5" : "justify-center py-1.5")} title={titulo}>
      {imagen ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagen} alt="" className="size-10 shrink-0 rounded-[14px] object-cover" />
      ) : (
        <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-coral-claro text-sm font-bold text-tinta">{iniciales}</span>
      )}
      {abierto && (
        <span className="min-w-0 text-[13px] leading-tight">
          <b className="block truncate text-tinta">{titulo}</b>
          <span className="block truncate text-gris">{linea}</span>
        </span>
      )}
    </div>
  );
}
