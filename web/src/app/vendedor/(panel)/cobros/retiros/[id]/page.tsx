"use client";

import Link from "next/link";
import { use } from "react";
import { Check, ChevronRight, Info } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { Cargando } from "@/components/ui";

type Detalle = {
  retiro: { id: string; monto_centimos: number; banco: string; ultimos4: string; estado: string; creado_en: string; pagado_en: string | null; pedidos: number };
  pedidos: { pedido_id: string; codigo: string; comprador: string; total_centimos: number; comision_centimos: number; neto_centimos: number }[];
  pagaron_centimos: number;
  culqi_centimos: number;
  operacion: string;
  motivo_rechazo: string;
};

// "Retiro del …": cuánto se depositó y qué pedidos incluye.
export default function DetalleRetiro({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: d, error } = useApi<Detalle>(`/vendedor/retiros/${id}`);
  if (error && !d) return <p className="text-sm text-gris">No encontramos este retiro.</p>;
  if (!d) return <Cargando />;
  const r = d.retiro;
  const fecha = new Date(r.creado_en);

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/cobros" className="hover:text-pino">Mis cobros</Link> <ChevronRight className="size-3.5" /> Retiro
      </p>
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Retiro del {fecha.toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "")}</h1>
        <p className="text-sm text-gris">
          {r.banco} •••• {r.ultimos4} · {fecha.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" })} {d.operacion ? ` · operación ${d.operacion}` : ""} · {r.estado === "pagado" ? "depositado" : r.estado === "rechazado" ? `rechazado: ${d.motivo_rechazo}. El dinero volvió a tu saldo disponible` : "en proceso, llega en 1 día hábil"}
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <h3 className="mb-3 text-lg font-extrabold text-tinta">Resumen</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gris">Pagaron tus clientes ({r.pedidos} {r.pedidos === 1 ? "pedido" : "pedidos"})</span><span>{soles(d.pagaron_centimos)}</span></div>
            <div className="flex justify-between"><span className="text-gris">Costo de Culqi</span><span>-{soles(d.culqi_centimos)}</span></div>
            <div className="flex justify-between"><span className="text-gris">Comisión de VendiGo</span><span>{soles(0)}</span></div>
            <div className="flex justify-between border-t border-linea pt-2 font-bold"><span>Te depositamos</span><span>{soles(r.monto_centimos)}</span></div>
          </div>
          <p className="mt-3 flex gap-1.5 text-xs text-gris"><Info className="mt-0.5 size-3.5 shrink-0" /> Con transferencia interbancaria (CCI) puede tardar hasta 1 día hábil en verse en tu banco.</p>
        </section>

        <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <h3 className="mb-2 text-lg font-extrabold text-tinta">Pedidos incluidos</h3>
          {d.pedidos.length ? (
            d.pedidos.map((p) => (
              <Link key={p.pedido_id} href={`/vendedor/pedidos/${p.pedido_id}`} className="flex items-center gap-3 border-b border-linea py-3 last:border-0 hover:bg-crema/40">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><Check className="size-4" /></span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block"><b className="text-tinta">{p.comprador}</b> <span className="text-xs text-gris">{p.codigo}</span></span>
                  <span className="text-xs text-gris">Pagó {soles(p.total_centimos)} · Culqi -{soles(p.comision_centimos)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-gris">Recibes</span>
                  <b className="font-display text-tinta">{soles(p.neto_centimos)}</b>
                </span>
              </Link>
            ))
          ) : (
            <p className="text-sm text-gris">Este retiro no tiene pedidos asociados.</p>
          )}
        </section>
      </div>
    </div>
  );
}
