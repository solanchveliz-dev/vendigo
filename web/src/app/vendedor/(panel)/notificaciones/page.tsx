"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, Bell, Check, ChevronRight, CircleHelp, ClipboardList, Wallet } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { hace } from "@/lib/formato";
import { Boton, Cargando, Vacio, cn } from "@/components/ui";
import { usePanel } from "@/components/panel/contexto";

type N = { id: string; titulo: string; cuerpo: string; enlace: string; leida: boolean; creado_en: string; tipo: string };

const FILTROS = [
  ["", "Todas"],
  ["pedidos", "Pedidos"],
  ["pagos", "Pagos"],
  ["consultas", "Consultas"],
  ["inventario", "Inventario"],
] as const;

const ICONOS: Record<string, React.ReactNode> = {
  pedidos: <ClipboardList className="size-[18px]" />,
  pagos: <Wallet className="size-[18px]" />,
  consultas: <CircleHelp className="size-[18px]" />,
  inventario: <AlertTriangle className="size-[18px]" />,
};

export default function Notificaciones() {
  const [tipo, setTipo] = useState("");
  const { datos, recargar } = useApi<{ notificaciones: N[] }>(`/vendedor/notificaciones${tipo ? `?tipo=${tipo}` : ""}`);
  const { recargarResumen } = usePanel();
  const router = useRouter();

  async function todas() {
    await api.post("/vendedor/notificaciones/leer").catch(() => null);
    recargar();
    recargarResumen();
  }

  async function abrir(n: N) {
    if (!n.leida) {
      await api.post(`/vendedor/notificaciones/${n.id}/leer`).catch(() => null);
      recargarResumen();
    }
    router.push(n.enlace || "/vendedor");
  }

  const hayNuevas = datos?.notificaciones.some((n) => !n.leida);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Notificaciones</h1>
        <p className="text-sm text-gris">Pedidos, consultas, inventario y pagos.</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-full bg-white p-1 ring-1 ring-linea">
          {FILTROS.map(([k, t]) => (
            <button key={k} onClick={() => setTipo(k)} className={cn("rounded-full px-4 py-2 text-sm font-semibold transition", tipo === k ? "bg-pino text-white" : "text-tinta hover:bg-crema")}>
              {t}
            </button>
          ))}
        </div>
        <Boton variante="secundario" tamano="sm" onClick={todas} disabled={!hayNuevas}>
          <Check className="size-4" /> Marcar todas como leídas
        </Boton>
      </div>

      {!datos ? (
        <Cargando />
      ) : !datos.notificaciones.length ? (
        <Vacio icono={<Bell className="size-6" />} titulo="Sin notificaciones" detalle="Te avisaremos de pedidos nuevos, preguntas, stock bajo y pagos por revisar." />
      ) : (
        <div className="rounded-[22px] bg-white px-5 py-3 shadow-suave ring-1 ring-linea/60">
          {datos.notificaciones.map((n) => (
            <button key={n.id} onClick={() => abrir(n)} className="flex w-full items-center gap-4 border-b border-linea py-4 text-left last:border-0 hover:bg-crema/40">
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", n.leida ? "bg-crema text-tinta" : "bg-coral-claro text-tinta")}>{ICONOS[n.tipo] ?? <Bell className="size-[18px]" />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <b className="text-sm text-tinta">{n.titulo}</b>
                  {!n.leida && <span className="rounded-full bg-aviso-claro px-2 py-0.5 text-xs font-bold text-aviso">Nueva</span>}
                </span>
                <span className="block text-sm text-gris">{n.cuerpo}</span>
              </span>
              <span className="shrink-0 text-xs text-gris first-letter:uppercase">{hace(n.creado_en)}</span>
              <ChevronRight className="size-4 shrink-0 text-tinta" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
