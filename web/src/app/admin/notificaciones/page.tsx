"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Bell, Check, ChevronRight, CreditCard, ShieldCheck, Store } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { fechaHora } from "@/lib/admin";
import { Cargando, cn } from "@/components/ui";
import { Titulo } from "@/components/admin/ui";

type Aviso = { id: string; titulo: string; cuerpo: string; enlace: string; tipo: string; leida: boolean; creado_en: string };
const FILTROS = [
  { id: "", t: "Todas" },
  { id: "incidencias", t: "Incidencias" },
  { id: "tiendas", t: "Tiendas" },
  { id: "pagos", t: "Pagos" },
  { id: "seguridad", t: "Seguridad" },
];
const ICONO: Record<string, typeof Bell> = { incidencias: AlertTriangle, tiendas: Store, pagos: CreditCard, seguridad: ShieldCheck };

function hace(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "Ahora";
  if (m < 60) return `Hace ${m} min`;
  if (m < 1440) return `Hace ${Math.round(m / 60)} h`;
  return fechaHora(iso);
}

export default function Notificaciones() {
  const { datos, recargar } = useApi<{ notificaciones: Aviso[] }>("/admin/bandeja");
  const [filtro, setFiltro] = useState("");
  const lista = (datos?.notificaciones ?? []).filter((a) => !filtro || a.tipo === filtro);
  const noLeidas = (datos?.notificaciones ?? []).some((a) => !a.leida);

  return (
    <>
      <Titulo titulo="Notificaciones" detalle="Incidencias, tiendas, pagos y seguridad de tu cuenta." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full bg-white p-1 ring-1 ring-linea/70">
          {FILTROS.map((f) => (
            <button key={f.id} onClick={() => setFiltro(f.id)} className={cn("h-10 rounded-full px-4 text-sm font-semibold", filtro === f.id ? "bg-pino text-white" : "text-tinta/80 hover:text-tinta")}>
              {f.t}
            </button>
          ))}
        </div>
        <button
          disabled={!noLeidas}
          onClick={async () => { await api.post("/admin/bandeja/leer").catch(() => null); recargar(); }}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-tinta ring-1 ring-linea disabled:opacity-50"
        >
          <Check className="size-4" /> Marcar todas como leídas
        </button>
      </div>
      {!datos ? (
        <Cargando />
      ) : (
        <section className="rounded-[22px] bg-white p-4 ring-1 ring-linea/70">
          {!lista.length ? (
            <p className="p-3 text-sm text-gris">No tienes notificaciones{filtro ? " de este tipo" : ""}.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {lista.map((a) => {
                const Icono = ICONO[a.tipo] ?? Bell;
                return (
                  <li key={a.id}>
                    <Link
                      href={a.enlace || "/admin"}
                      onClick={() => { if (!a.leida) api.post(`/admin/bandeja/${a.id}/leer`).catch(() => null); }}
                      className="flex items-center gap-4 rounded-xl px-3 py-4 hover:bg-crema/50"
                    >
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", a.leida ? "bg-crema text-tinta" : "bg-coral-claro text-coral")}><Icono className="size-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <b className="text-sm text-tinta">{a.titulo}</b>
                          {!a.leida && <span className="rounded-full bg-aviso-claro px-2 py-0.5 text-xs font-bold text-aviso">Nueva</span>}
                        </span>
                        <span className="block text-sm text-gris">{a.cuerpo}</span>
                      </span>
                      <span className="shrink-0 text-xs text-gris">{hace(a.creado_en)}</span>
                      <ChevronRight className="size-4 shrink-0 text-tinta" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
