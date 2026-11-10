"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Crown, Search, Store } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { RUBROS, fecha } from "@/lib/admin";
import { Cargando } from "@/components/ui";
import { PagosPlan } from "@/components/admin/pagos-plan";
import { Estado, Indicador, Paginacion, Titulo, useExportar } from "@/components/admin/ui";

type Suscripcion = {
  tienda_id: string;
  tienda: string;
  rubro: string;
  lugar: string;
  logo_url: string;
  plan_id: string;
  plan: string;
  precio_centimos: number;
  mes_gratis: boolean;
  inicio: string | null;
  fin: string | null;
  ultimo_pago: string | null;
  ultimo_monto_centimos: number | null;
  estado: "activa" | "vencida" | "suspendida";
};
type Plan = { id: string; nombre: string; precio_centimos: number };

const ESTADO = {
  activa: { t: "Activa", tono: "ok" as const },
  vencida: { t: "Vencida", tono: "aviso" as const },
  suspendida: { t: "Suspendida", tono: "error" as const },
};
const POR_PAGINA = 20;

export default function Suscripciones() {
  const { datos } = useApi<{ suscripciones: Suscripcion[]; planes: Plan[] }>("/admin/suscripciones");
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [pagina, setPagina] = useState(1);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.suscripciones ?? []).filter((s) => (!plan || s.plan_id === plan) && (!t || [s.tienda, s.lugar].some((v) => v.toLowerCase().includes(t))));
  }, [datos, q, plan]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("suscripciones", () => [
    ["Tienda", "Plan", "Próximo cobro", "Último pago", "Monto último pago", "Estado"],
    ...lista.map((s) => [s.tienda, s.plan, s.plan_id === "gratis" ? "" : fecha(s.fin), fecha(s.ultimo_pago), s.ultimo_monto_centimos != null ? (s.ultimo_monto_centimos / 100).toFixed(2) : "", ESTADO[s.estado].t]),
  ]);

  return (
    <>
      <Titulo
        titulo="Suscripciones"
        detalle="Planes de las tiendas."
        accion={
          <Link href="/admin/planes" className="inline-flex h-11 items-center gap-2 rounded-full bg-pino px-5 text-sm font-bold text-white">
            <Crown className="size-4" /> Gestionar planes
          </Link>
        }
      />
      {!datos ? (
        <Cargando />
      ) : (
        <>
          <PagosPlan />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {datos.planes.map((p) => {
              const activas = datos.suscripciones.filter((s) => s.plan_id === p.id && s.estado === "activa");
              const pagan = activas.filter((s) => !s.mes_gratis).length;
              return (
                <Indicador
                  key={p.id}
                  oscuro={p.id === "emprende"}
                  titulo={`Plan ${p.nombre}`}
                  valor={activas.length.toLocaleString("es-PE")}
                  detalle={p.precio_centimos ? `${soles(p.precio_centimos * pagan)} al mes` : "Sin costo"}
                  icono={<Crown className="size-4" />}
                />
              );
            })}
          </div>
          <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
            <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
              <label className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar tienda…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
              </label>
              <select value={plan} onChange={(e) => { setPlan(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Plan">
                <option value="">Plan: todos</option>
                {datos.planes.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
            </div>
            {!lista.length ? (
              <p className="p-6 text-sm text-gris">No hay tiendas con ese plan.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                      <th className="px-5 py-3.5">Tienda</th>
                      <th className="px-5 py-3.5">Plan</th>
                      <th className="px-5 py-3.5">Próximo cobro</th>
                      <th className="px-5 py-3.5">Último pago</th>
                      <th className="px-5 py-3.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((s) => (
                      <tr key={s.tienda_id} className="relative border-b border-linea last:border-0 hover:bg-crema/40">
                        <td className="px-5 py-3">
                          <Link href={`/admin/tiendas/${s.tienda_id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                            <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-crema text-tinta">
                              <Store className="size-5" />
                              {s.logo_url && <img src={s.logo_url} alt="" onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 size-full object-cover" />}
                            </span>
                            <span>
                              <b className="block text-tinta">{s.tienda}</b>
                              <span className="text-xs text-gris">{RUBROS[s.rubro] ?? s.rubro} · {s.lugar}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-5 py-3 font-bold text-tinta">
                          {s.plan}
                          {s.mes_gratis && <span className="ml-2 text-xs font-semibold text-coral">mes gratis</span>}
                        </td>
                        <td className="px-5 py-3 text-tinta">{s.plan_id === "gratis" ? "—" : fecha(s.fin)}</td>
                        <td className="px-5 py-3 text-tinta">
                          {s.ultimo_pago ? <>{fecha(s.ultimo_pago)} <span className="text-gris">· {soles(s.ultimo_monto_centimos)}</span></> : <span className="text-gris">Sin pagos</span>}
                        </td>
                        <td className="px-5 py-3"><Estado tono={ESTADO[s.estado].tono}>{ESTADO[s.estado].t}</Estado></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Paginacion total={lista.length} visibles={visibles.length} pagina={actual} paginas={paginas} cambiar={setPagina} />
          </section>
        </>
      )}
    </>
  );
}
