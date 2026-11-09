"use client";

import { useMemo, useState } from "react";
import { Download, Flag, MessagesSquare, Package, ShoppingBag, Users, Wallet, Briefcase } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { useAvisar } from "@/components/ui";
import { Cargando } from "@/components/ui";
import { Tarjeta, Titulo, descargarCSV } from "@/components/admin/ui";

type Datos = {
  usuarios_semana: number[];
  pedidos: { entregados: number; en_curso: number; cancelados: number };
  reclamos: Record<string, number>;
  consultas: { preguntas: number; respuesta_min: number; automaticas_pct: number; mensajes_ayuda: number; creditos_ia: number };
};

const AREAS = [
  { id: "usuarios", t: "Usuarios", d: "Altas del mes", icono: Users },
  { id: "vendedores", t: "Vendedores", d: "Planes, pedidos y ventas", icono: Briefcase },
  { id: "productos", t: "Productos", d: "Publicados, agotados y retirados", icono: Package },
  { id: "pedidos", t: "Pedidos", d: "Estados y tipos de entrega", icono: ShoppingBag },
  { id: "pagos", t: "Pagos", d: "Cobros, comisiones y liberaciones", icono: Wallet },
  { id: "reclamos", t: "Reclamos", d: "Motivos y resolución", icono: Flag },
];
const MOTIVOS: Record<string, string> = { no_llego: "No llegó", danado: "Llegó dañado", distinto: "Distinto a lo publicado", incompleto: "Incompleto", otro: "Otro" };

function meses() {
  const out: { v: string; t: string }[] = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const t = m.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
    out.push({ v: `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`, t: t[0].toUpperCase() + t.slice(1) });
  }
  return out;
}

function tiempo(min: number) {
  if (!min) return "—";
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 1440) return `${(min / 60).toFixed(1)} h`;
  return `${(min / 1440).toFixed(1)} días`;
}

export default function Reportes() {
  const avisar = useAvisar();
  const lista = useMemo(meses, []);
  const [mes, setMes] = useState(lista[0].v);
  const [bajando, setBajando] = useState("");
  const { datos: d } = useApi<Datos>(`/admin/reportes?mes=${mes}`);

  async function bajar(area: string) {
    setBajando(area);
    try {
      const r = await api.get<{ filas: string[][] }>(`/admin/reportes/csv?area=${area}&mes=${mes}`);
      if (r.filas.length <= 1) avisar("No hay datos de ese mes, igual se descargó el archivo con los títulos.");
      descargarCSV(`${area}-${mes}`, r.filas);
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setBajando("");
    }
  }

  const maxSem = Math.max(1, ...(d?.usuarios_semana ?? [0]));
  const totalPed = d ? d.pedidos.entregados + d.pedidos.en_curso + d.pedidos.cancelados : 0;
  const pct = (n: number) => (totalPed ? Math.round((n / totalPed) * 100) : 0);
  const totalRec = d ? Object.values(d.reclamos).reduce((a, b) => a + b, 0) : 0;
  const a = pct(d?.pedidos.entregados ?? 0), b = pct(d?.pedidos.en_curso ?? 0);

  return (
    <>
      <Titulo
        titulo="Reportes"
        detalle="Descarga o revisa indicadores por área."
        accion={
          <select value={mes} onChange={(e) => setMes(e.target.value)} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Mes">
            {lista.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
          </select>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {AREAS.map((x) => (
          <section key={x.id} className="rounded-[22px] bg-white p-5 ring-1 ring-linea/70">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><x.icono className="size-5" /></span>
              <span>
                <b className="block text-tinta">{x.t}</b>
                <span className="text-sm text-gris">{x.d}</span>
              </span>
            </div>
            <button onClick={() => bajar(x.id)} disabled={bajando === x.id} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-tinta ring-1 ring-linea hover:ring-pino/40 disabled:opacity-60">
              <Download className="size-4" /> {bajando === x.id ? "Descargando…" : "Descargar CSV"}
            </button>
          </section>
        ))}
      </div>

      {!d ? (
        <Cargando />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Tarjeta titulo="Nuevos usuarios por semana">
            <div className="flex h-48 items-end justify-around gap-4 pt-4">
              {d.usuarios_semana.map((n, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-sm font-bold text-tinta">{n}</span>
                  <div className={`w-full max-w-12 rounded-xl ${n === maxSem && n > 0 ? "bg-pino" : "bg-[#e7e5e0]"}`} style={{ height: `${Math.max(4, (n / maxSem) * 100)}%` }} />
                  <span className="text-xs text-gris">Sem {i + 1}</span>
                </div>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta titulo={<span className="inline-flex items-center gap-2"><MessagesSquare className="size-5" /> Consultas</span>}>
            <dl className="space-y-3 text-[15px]">
              {[
                ["Preguntas de compradores", d.consultas.preguntas.toLocaleString("es-PE")],
                ["Respuesta promedio de tiendas", tiempo(d.consultas.respuesta_min)],
                ["Respuestas automáticas usadas", `${Math.round(d.consultas.automaticas_pct)}%`],
                ["Mensajes de ayuda en pedidos", d.consultas.mensajes_ayuda.toLocaleString("es-PE")],
                ["Uso de asistencia IA", `${d.consultas.creditos_ia.toLocaleString("es-PE")} créditos`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-tinta">{k}</dt><dd className="font-bold text-tinta">{v}</dd></div>
              ))}
            </dl>
          </Tarjeta>

          <Tarjeta titulo="Reclamos por motivo">
            {!totalRec ? (
              <p className="text-sm text-gris">No hubo reclamos este mes.</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(MOTIVOS).map(([k, t]) => {
                  const p = Math.round(((d.reclamos[k] ?? 0) / totalRec) * 100);
                  return (
                    <div key={k} className="grid grid-cols-[150px_1fr_48px] items-center gap-3 text-sm">
                      <span className="text-tinta">{t}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-[#ebe7df]"><span className="block h-full rounded-full bg-pino" style={{ width: `${p}%` }} /></span>
                      <span className="text-right font-bold text-tinta">{p}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Estado de pedidos">
            {!totalPed ? (
              <p className="text-sm text-gris">No hubo pedidos este mes.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-8">
                <div
                  className="relative grid size-36 place-items-center rounded-full"
                  style={{ background: `conic-gradient(var(--color-pino, #123c39) 0 ${a}%, #e8a33d ${a}% ${a + b}%, #e5ded2 ${a + b}% 100%)` }}
                >
                  <span className="grid size-24 place-items-center rounded-full bg-white font-display text-xl font-extrabold text-tinta">{totalPed.toLocaleString("es-PE")}</span>
                </div>
                <ul className="space-y-2 text-sm text-tinta">
                  <li className="flex items-center gap-2"><span className="size-3 rounded-sm bg-pino" /> Entregados · <b>{a}%</b></li>
                  <li className="flex items-center gap-2"><span className="size-3 rounded-sm bg-[#e8a33d]" /> En curso · <b>{b}%</b></li>
                  <li className="flex items-center gap-2"><span className="size-3 rounded-sm bg-[#e5ded2]" /> Cancelados · <b>{pct(d.pedidos.cancelados)}%</b></li>
                </ul>
              </div>
            )}
          </Tarjeta>
        </div>
      )}
    </>
  );
}
