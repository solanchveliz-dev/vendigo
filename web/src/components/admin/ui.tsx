"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/components/ui";

// Piezas del panel admin con el mismo estilo del prototipo.

export function Titulo({ titulo, detalle, accion, migas }: { titulo: string; detalle?: React.ReactNode; accion?: React.ReactNode; migas?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {migas && <p className="mb-3 flex items-center gap-1.5 text-sm text-gris">{migas}</p>}
        <div className="mb-3 h-1 w-10 rounded-full bg-coral" />
        <h1 className="font-display text-[34px] font-extrabold leading-tight tracking-[-0.02em] text-pino md:text-[38px]">{titulo}</h1>
        {detalle && <p className="mt-1 max-w-2xl text-[15px] text-gris">{detalle}</p>}
      </div>
      {accion}
    </div>
  );
}

export function Indicador({ titulo, valor, detalle, icono, oscuro, alerta }: { titulo: string; valor: React.ReactNode; detalle?: React.ReactNode; icono: React.ReactNode; oscuro?: boolean; alerta?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[22px] p-5 ring-1", oscuro ? "bg-pino text-white ring-pino" : "bg-white ring-linea/70")}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-sm", oscuro ? "text-white/85" : "text-tinta/80")}>{titulo}</p>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", oscuro ? "bg-white/10 text-coral" : "bg-crema text-tinta")}>{icono}</span>
      </div>
      <p className="mt-4 font-display text-[30px] font-extrabold leading-none">{valor}</p>
      {detalle && <p className={cn("mt-3 text-[13px] font-semibold", oscuro ? "text-white/85" : alerta ? "text-error" : "text-tinta")}>{detalle}</p>}
      {oscuro && <div className="absolute -bottom-12 -right-8 size-28 rounded-full bg-white/15" />}
    </div>
  );
}

export function Tarjeta({ titulo, accion, children, className }: { titulo?: React.ReactNode; accion?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[22px] bg-white p-6 ring-1 ring-linea/70", className)}>
      {(titulo || accion) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {titulo && <h3 className="text-lg font-bold text-tinta">{titulo}</h3>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

const tonos = {
  ok: "bg-pino-claro text-pino",
  aviso: "bg-aviso-claro text-aviso",
  error: "bg-error-claro text-error",
  neutro: "bg-[#ebe7df] text-tinta",
};

export function Estado({ tono, children }: { tono: keyof typeof tonos; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-bold", tonos[tono])}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Avatar({ nombre, className }: { nombre: string; className?: string }) {
  const ini = nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return <span className={cn("grid size-9 shrink-0 place-items-center rounded-full bg-pino text-[13px] font-bold text-coral", className)}>{ini}</span>;
}

export function Paginacion({ total, visibles, pagina, paginas, cambiar }: { total: number; visibles: number; pagina: number; paginas: number; cambiar: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-linea px-5 py-3.5 text-sm text-gris">
      <span>Mostrando {visibles} de {total}</span>
      <span className="flex items-center gap-1.5">
        <button onClick={() => cambiar(pagina - 1)} disabled={pagina <= 1} className="grid size-8 place-items-center rounded-lg ring-1 ring-linea disabled:opacity-40" aria-label="Anterior"><ChevronLeft className="size-4" /></button>
        {Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (
          <button key={n} onClick={() => cambiar(n)} className={cn("grid size-8 place-items-center rounded-lg text-sm font-semibold", n === pagina ? "bg-pino text-white" : "ring-1 ring-linea text-tinta")}>{n}</button>
        ))}
        <button onClick={() => cambiar(pagina + 1)} disabled={pagina >= paginas} className="grid size-8 place-items-center rounded-lg ring-1 ring-linea disabled:opacity-40" aria-label="Siguiente"><ChevronRight className="size-4" /></button>
      </span>
    </div>
  );
}

export function Nota({ children }: { children: React.ReactNode }) {
  return <p className="flex gap-2.5 rounded-2xl bg-[#ece9e2] px-5 py-3.5 text-sm text-tinta">ⓘ <span>{children}</span></p>;
}

// "Exportar" de la barra de arriba descarga en CSV lo que muestra la página abierta.
export function useExportar(nombre: string, filas: () => (string | number)[][]) {
  const ref = useRef(filas);
  ref.current = filas;
  useEffect(() => {
    const f = () => descargarCSV(nombre, ref.current());
    window.addEventListener("vg:exportar", f);
    return () => window.removeEventListener("vg:exportar", f);
  }, [nombre]);
}

export function descargarCSV(nombre: string, filas: (string | number)[][]) {
  const csv = filas.map((f) => f.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
