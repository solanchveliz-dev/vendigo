"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Loader2, X, CheckCircle2, AlertCircle } from "lucide-react";

export function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------- Botones ----------

type BotonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "acento" | "secundario" | "fantasma" | "peligro";
  tamano?: "sm" | "md" | "lg";
  cargando?: boolean;
  bloque?: boolean;
};

export function Boton({ variante = "primario", tamano = "md", cargando, bloque, className, children, disabled, ...p }: BotonProps) {
  const v = {
    primario: "bg-pino text-white hover:bg-pino-2",
    acento: "bg-coral text-white hover:brightness-95",
    secundario: "bg-white text-pino ring-1 ring-linea hover:bg-arena/60",
    fantasma: "text-pino hover:bg-pino-claro",
    peligro: "bg-white text-error ring-1 ring-error/30 hover:bg-error-claro",
  }[variante];
  const t = { sm: "h-9 px-4 text-sm", md: "h-11 px-5 text-[15px]", lg: "h-12 px-6 text-base" }[tamano];
  return (
    <button
      {...p}
      disabled={disabled || cargando}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed",
        v,
        t,
        bloque && "w-full",
        className,
      )}
    >
      {cargando && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

// ---------- Contenedores ----------

export function Tarjeta({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cn("rounded-xl bg-white p-5 shadow-suave ring-1 ring-linea/60", className)}>
      {children}
    </div>
  );
}

export function Encabezado({ titulo, detalle, children }: { titulo: string; detalle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[28px] font-extrabold leading-tight text-pino">{titulo}</h1>
        {detalle && <p className="mt-1 max-w-2xl text-sm text-gris">{detalle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Insignia({ tono = "neutro", children }: { tono?: "neutro" | "ok" | "aviso" | "error" | "pino" | "coral"; children: React.ReactNode }) {
  const t = {
    neutro: "bg-arena text-tinta",
    ok: "bg-ok-claro text-ok",
    aviso: "bg-aviso-claro text-aviso",
    error: "bg-error-claro text-error",
    pino: "bg-pino-claro text-pino",
    coral: "bg-coral-claro text-coral",
  }[tono];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", t)}>{children}</span>;
}

export function Aviso({ tono = "info", children, className }: { tono?: "info" | "ok" | "aviso" | "error"; children: React.ReactNode; className?: string }) {
  const t = {
    info: "bg-pino-claro text-pino",
    ok: "bg-ok-claro text-ok",
    aviso: "bg-aviso-claro text-aviso",
    error: "bg-error-claro text-error",
  }[tono];
  return <div className={cn("rounded-xl px-4 py-3 text-sm", t, className)}>{children}</div>;
}

export function Vacio({ icono, titulo, detalle, children }: { icono?: React.ReactNode; titulo: string; detalle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-linea bg-white/60 px-6 py-12 text-center">
      {icono && <div className="mb-3 grid size-14 place-items-center rounded-full bg-pino-claro text-pino">{icono}</div>}
      <p className="font-display text-lg font-bold text-pino">{titulo}</p>
      {detalle && <p className="mt-1 max-w-sm text-sm text-gris">{detalle}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Cargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-gris">
      <Loader2 className="size-4 animate-spin" /> {texto}
    </div>
  );
}

// ---------- Formularios ----------

export function Campo({ etiqueta, ayuda, error, children }: { etiqueta: string; ayuda?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-tinta">{etiqueta}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-error">{error}</span> : ayuda && <span className="mt-1 block text-xs text-gris">{ayuda}</span>}
    </label>
  );
}

const base = "w-full rounded-xl border border-linea bg-white px-3.5 text-[15px] outline-none transition focus:border-pino focus:ring-2 focus:ring-pino/15";

export function Entrada(p: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(base, "h-11", p.className)} />;
}

export function Area(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cn(base, "min-h-24 py-2.5", p.className)} />;
}

export function Selector(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn(base, "h-11 pr-8", p.className)} />;
}

export function Interruptor({ activo, onChange, etiqueta, detalle }: { activo: boolean; onChange: (v: boolean) => void; etiqueta: string; detalle?: string }) {
  return (
    <button type="button" onClick={() => onChange(!activo)} className="flex w-full items-center justify-between gap-4 py-2 text-left">
      <span>
        <span className="block font-semibold">{etiqueta}</span>
        {detalle && <span className="block text-sm text-gris">{detalle}</span>}
      </span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", activo ? "bg-pino" : "bg-linea")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition", activo ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

// Filtros en forma de chips (los mismos en la web y en la app).
export function Chips<T extends string>({ opciones, valor, onChange }: { opciones: { valor: T; texto: string; n?: number }[]; valor: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((o) => (
        <button
          key={o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition",
            valor === o.valor ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea hover:bg-arena/60",
          )}
        >
          {o.texto}
          {o.n !== undefined && o.n > 0 && (
            <span className={cn("rounded-full px-1.5 text-xs", valor === o.valor ? "bg-white/20" : "bg-arena")}>{o.n}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({ abierto, onCerrar, titulo, children, ancho = "max-w-lg" }: { abierto: boolean; onCerrar: () => void; titulo: string; children: React.ReactNode; ancho?: string }) {
  useEffect(() => {
    if (!abierto) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [abierto, onCerrar]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-tinta/40 p-0 sm:items-center sm:p-4" onClick={onCerrar}>
      <div className={cn("max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-crema p-6 shadow-2xl sm:rounded-2xl", ancho)} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-extrabold text-pino">{titulo}</h2>
          <button onClick={onCerrar} className="grid size-9 place-items-center rounded-full hover:bg-arena" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Mensajes cortos ----------

type Mensaje = { id: number; texto: string; tono: "ok" | "error" };
const Ctx = createContext<(texto: string, tono?: "ok" | "error") => void>(() => {});

export function ProveedorMensajes({ children }: { children: React.ReactNode }) {
  const [lista, setLista] = useState<Mensaje[]>([]);
  const avisar = useCallback((texto: string, tono: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setLista((l) => [...l, { id, texto, tono }]);
    setTimeout(() => setLista((l) => l.filter((m) => m.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[400] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {lista.map((m) => (
          <div key={m.id} className={cn("pointer-events-auto flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg", m.tono === "ok" ? "bg-pino" : "bg-error")}>
            {m.tono === "ok" ? <CheckCircle2 className="size-4" /> : <AlertCircle className="size-4" />}
            {m.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useAvisar = () => useContext(Ctx);
