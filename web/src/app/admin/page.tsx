"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, CreditCard, Crown, Flag, Package, ShoppingBag, Store, TrendingUp, Users, Wallet } from "lucide-react";
import { useApi } from "@/lib/api";
import { Cargando, cn } from "@/components/ui";
import { Estado, Indicador, Tarjeta, Titulo, useExportar } from "@/components/admin/ui";

type Parte = { clave: string; nombre: string; cantidad: number };
type Panel = {
  fecha: string;
  indicadores: {
    usuarios: number;
    usuarios_semana: number;
    compradores: number;
    vendedores: number;
    vendedores_semana: number;
    tiendas_activas: number;
    identidades_por_revisar: number;
    tiendas_en_revision: number;
    pedidos_mes: number;
    pedidos_mes_anterior: number;
    pagos: number;
    pagos_confirmados_pct: number;
    ventas_centimos: number;
    ingresos_planes_mes_centimos: number;
    tiendas_pagando: number;
    tiendas_gratis: number;
    reclamos_abiertos: number;
  };
  semanas: { etiqueta: string; pedidos: number }[];
  planes: Parte[];
  entregas: Parte[];
  reclamos: { pedido_id: string; codigo: string; tienda: string; motivo: string; estado: string }[];
  por_revisar: { tienda_id: string; tienda: string; lugar: string; logo_url: string }[];
};

const MOTIVOS: Record<string, string> = { no_llego: "Pedido no entregado", danado: "Llegó dañado", distinto: "Producto distinto al publicado", incompleto: "Llegó incompleto", otro: "Otro motivo" };
const COLORES = ["#ebe6dc", "#d9cfc0", "#203a43", "#1d2a44"];

const num = (n: number) => n.toLocaleString("es-PE").replace(/,/g, " ");
function solesCorto(c: number) {
  const s = c / 100;
  if (s >= 1_000_000) return `S/ ${(s / 1_000_000).toLocaleString("es-PE", { maximumFractionDigits: 2 })} M`;
  if (s >= 10_000) return `S/ ${(s / 1000).toLocaleString("es-PE", { maximumFractionDigits: 0 })} k`;
  return `S/ ${s.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Dona({ partes }: { partes: Parte[] }) {
  const total = partes.reduce((a, p) => a + p.cantidad, 0);
  let acum = 0;
  const r = 15.9155; // circunferencia 100
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-[150px]">
        <svg viewBox="0 0 40 40" className="size-full -rotate-90">
          <circle cx="20" cy="20" r={r} fill="none" stroke="#f1eee8" strokeWidth="7" />
          {total > 0 &&
            partes.map((p, i) => {
              const pct = (p.cantidad / total) * 100;
              const el = <circle key={p.clave} cx="20" cy="20" r={r} fill="none" stroke={COLORES[i % COLORES.length]} strokeWidth="7" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acum} />;
              acum += pct;
              return el;
            })}
        </svg>
        <span className="absolute inset-0 grid place-items-center font-display text-lg font-extrabold text-tinta">{num(total)}</span>
      </div>
      <ul className="space-y-2 text-[15px] text-tinta">
        {partes.map((p, i) => (
          <li key={p.clave} className="flex items-center gap-2.5">
            <span className="size-2.5 rounded-sm" style={{ background: COLORES[i % COLORES.length] }} />
            {p.nombre} · <b>{total ? Math.round((p.cantidad / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PanelAdmin() {
  const { datos: d } = useApi<Panel>("/admin/panel");
  useExportar("panel-vendigo", () => {
    if (!d) return [];
    const k = d.indicadores;
    return [
      ["Indicador", "Valor"],
      ["Usuarios", k.usuarios], ["Compradores", k.compradores], ["Vendedores", k.vendedores], ["Tiendas activas", k.tiendas_activas],
      ["Pedidos (mes)", k.pedidos_mes], ["Pagos registrados", k.pagos], ["Ventas registradas (S/)", (k.ventas_centimos / 100).toFixed(2)],
      ["Ingresos por planes este mes (S/)", (k.ingresos_planes_mes_centimos / 100).toFixed(2)], ["Reclamos abiertos", k.reclamos_abiertos],
      [], ["Semana", "Pedidos"], ...d.semanas.map((s) => [s.etiqueta, s.pedidos]),
    ];
  });
  if (!d) return <Cargando />;
  const k = d.indicadores;
  const variacion = k.pedidos_mes_anterior ? Math.round(((k.pedidos_mes - k.pedidos_mes_anterior) / k.pedidos_mes_anterior) * 100) : null;
  const maxSemana = Math.max(1, ...d.semanas.map((s) => s.pedidos));
  const totalEntregas = d.entregas.reduce((a, e) => a + e.cantidad, 0);

  return (
    <>
      <Titulo titulo="Panel de administración" detalle={`Resumen de la plataforma · ${d.fecha}`} />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador oscuro titulo="Usuarios" valor={num(k.usuarios)} detalle={`+${k.usuarios_semana} esta semana`} icono={<Users className="size-[18px]" />} />
        <Indicador titulo="Compradores" valor={num(k.compradores)} detalle={`${k.usuarios ? Math.round((k.compradores / k.usuarios) * 100) : 0}% del total`} icono={<ShoppingBag className="size-[18px]" />} />
        <Indicador titulo="Vendedores" valor={num(k.vendedores)} detalle={`+${k.vendedores_semana} esta semana`} icono={<Wallet className="size-[18px]" />} />
        <Indicador titulo="Tiendas activas" valor={num(k.tiendas_activas)} detalle={`${k.tiendas_en_revision} en revisión`} icono={<Store className="size-[18px]" />} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador titulo="Pedidos (mes)" valor={num(k.pedidos_mes)} detalle={variacion === null ? "Primer mes" : `${variacion >= 0 ? "+" : ""}${variacion}% vs. mes pasado`} icono={<Package className="size-[18px]" />} />
        <Indicador titulo="Pagos registrados" valor={num(k.pagos)} detalle={`${k.pagos_confirmados_pct.toLocaleString("es-PE", { maximumFractionDigits: 1 })}% ya informados por la tienda`} icono={<CreditCard className="size-[18px]" />} />
        <Indicador titulo="Ventas registradas" valor={solesCorto(k.ventas_centimos)} detalle="Pagadas directo a emprendedores" icono={<TrendingUp className="size-[18px]" />} />
        <Indicador titulo="Ingresos por planes" valor={solesCorto(k.ingresos_planes_mes_centimos)} detalle={`${k.tiendas_pagando} pagando · ${k.tiendas_gratis} gratis`} icono={<Crown className="size-[18px]" />} />
        <Indicador titulo="Reclamos abiertos" valor={num(k.reclamos_abiertos)} detalle={k.reclamos_abiertos ? "Atender hoy" : "Todo al día"} alerta={k.reclamos_abiertos > 0} icono={<Flag className="size-[18px]" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          <Tarjeta titulo="Pedidos por semana">
            <div className="flex h-52 items-end justify-around gap-4 px-4">
              {d.semanas.map((s, i) => (
                <div key={s.etiqueta} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-xs font-semibold text-tinta">{s.pedidos}</span>
                  <div className={cn("w-full max-w-11 rounded-xl", i === d.semanas.length - 1 ? "bg-pino" : "bg-[#e9ebe8]")} style={{ height: `${Math.max(4, (s.pedidos / maxSemana) * 85)}%` }} />
                  <span className="text-xs text-gris">{s.etiqueta}</span>
                </div>
              ))}
            </div>
          </Tarjeta>
          <div className="grid gap-5 md:grid-cols-2">
            <Tarjeta titulo="Suscripciones por plan"><Dona partes={d.planes} /></Tarjeta>
            <Tarjeta titulo="Entrega elegida por compradores">
              <ul className="space-y-4">
                {d.entregas.map((e, i) => {
                  const pct = totalEntregas ? Math.round((e.cantidad / totalEntregas) * 100) : 0;
                  return (
                    <li key={e.clave} className="grid grid-cols-[100px_1fr_40px] items-center gap-3 text-[15px] text-tinta">
                      {e.nombre}
                      <span className="h-2.5 overflow-hidden rounded-full bg-[#f1eee8]">
                        <span className={cn("block h-full rounded-full", i < 2 ? "bg-pino" : "bg-[#cfd5d3]")} style={{ width: `${pct}%` }} />
                      </span>
                      <b className="text-right">{pct}%</b>
                    </li>
                  );
                })}
              </ul>
            </Tarjeta>
          </div>
        </div>
        <div className="space-y-5">
          <Tarjeta titulo="Reclamos abiertos" accion={<Link href="/admin/reclamos" className="text-sm font-semibold text-tinta hover:text-pino">Ver</Link>}>
            {!d.reclamos.length ? (
              <p className="text-sm text-gris">No hay reclamos abiertos.</p>
            ) : (
              d.reclamos.map((c) => (
                <Link key={c.pedido_id} href="/admin/reclamos" className="flex items-center gap-3 border-b border-linea py-3 last:border-0">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><Flag className="size-[18px]" /></span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm text-tinta">{MOTIVOS[c.motivo] ?? c.motivo}</b>
                    <span className="text-xs text-gris">{c.codigo} · {c.tienda}</span>
                  </span>
                  <Estado tono={c.estado === "abierto" ? "error" : "aviso"}>{c.estado === "abierto" ? "Alta" : "Media"}</Estado>
                </Link>
              ))
            )}
          </Tarjeta>
          <Tarjeta titulo="Tiendas por revisar" accion={<Link href="/admin/tiendas" className="text-sm font-semibold text-tinta hover:text-pino">Ver</Link>}>
            {!d.por_revisar.length ? (
              <p className="text-sm text-gris">Ninguna tienda por revisar.</p>
            ) : (
              d.por_revisar.map((t) => (
                <Link key={t.tienda_id} href={`/admin/tiendas/${t.tienda_id}`} className="flex items-center gap-3 border-b border-linea py-3 last:border-0">
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-crema">
                    {t.logo_url ? <Image src={t.logo_url} alt="" width={44} height={44} className="size-full object-cover" unoptimized /> : <Store className="size-5 text-tinta" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm text-tinta">{t.tienda}</b>
                    <span className="text-xs text-gris">{t.lugar}</span>
                  </span>
                  <ChevronRight className="size-4 text-tinta" />
                </Link>
              ))
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
