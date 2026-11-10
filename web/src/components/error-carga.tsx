"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, WifiOff, X } from "lucide-react";

export type DetalleErrorCarga = { ruta: string; estado: number; mensaje: string };

// Cuando una sección no se puede cargar, las páginas se quedaban en "Cargando…" para siempre.
// Este aviso muestra qué falló y permite reintentar. Lo alimenta useApi (lib/api.ts).
export function ErrorCarga() {
  const [errores, setErrores] = useState<Record<string, DetalleErrorCarga>>({});
  const pagina = usePathname();

  useEffect(() => {
    const fallo = (e: Event) => {
      const d = (e as CustomEvent<DetalleErrorCarga>).detail;
      setErrores((x) => ({ ...x, [d.ruta]: d }));
    };
    const ok = (e: Event) => {
      const ruta = (e as CustomEvent<{ ruta: string }>).detail.ruta;
      setErrores((x) => {
        if (!(ruta in x)) return x;
        const y = { ...x };
        delete y[ruta];
        return y;
      });
    };
    window.addEventListener("vg:error-carga", fallo);
    window.addEventListener("vg:carga-ok", ok);
    return () => {
      window.removeEventListener("vg:error-carga", fallo);
      window.removeEventListener("vg:carga-ok", ok);
    };
  }, []);

  // Al cambiar de página se limpian los avisos de la anterior.
  useEffect(() => setErrores({}), [pagina]);

  const lista = Object.values(errores);
  if (!lista.length) return null;
  const primero = lista[0];
  const sinServidor = primero.estado === 0 || primero.estado >= 500;

  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl bg-error-claro px-4 py-3 text-sm text-tinta ring-1 ring-error/20">
      <WifiOff className="mt-0.5 size-4 shrink-0 text-error" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{sinServidor ? "No pudimos cargar esta sección" : "Esta sección no se pudo cargar"}</p>
        <p className="text-gris">
          {primero.mensaje}
          {lista.length > 1 && ` (y ${lista.length - 1} ${lista.length === 2 ? "sección más" : "secciones más"})`}
        </p>
      </div>
      <button onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-pino ring-1 ring-linea">
        <RefreshCw className="size-3.5" /> Reintentar
      </button>
      <button onClick={() => setErrores({})} className="grid size-8 place-items-center rounded-full text-gris hover:bg-white" aria-label="Cerrar aviso">
        <X className="size-4" />
      </button>
    </div>
  );
}
