"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Bike, Package, Search, Store } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { ENTREGA, GRUPOS_PEDIDO, estadoPedidoAdmin, fecha, type PedidoAdmin } from "@/lib/admin";
import { Cargando } from "@/components/ui";
import { Estado, Paginacion, Titulo, useExportar } from "@/components/admin/ui";

const POR_PAGINA = 20;
const ICONO = { agencia: Package, motorizado: Bike, recojo: Store };

export default function Pedidos() {
  const { datos } = useApi<{ pedidos: PedidoAdmin[] }>("/admin/pedidos");
  const [q, setQ] = useState("");
  const [grupo, setGrupo] = useState("");
  const [entrega, setEntrega] = useState("");
  const [pagina, setPagina] = useState(1);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.pedidos ?? []).filter(
      (p) =>
        (!grupo || estadoPedidoAdmin(p).grupo === grupo) &&
        (!entrega || p.entrega === entrega) &&
        (!t || [p.codigo, p.tienda, p.comprador].some((v) => v.toLowerCase().includes(t))),
    );
  }, [datos, q, grupo, entrega]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("pedidos", () => [
    ["Pedido", "Fecha", "Tienda", "Comprador", "Entrega", "Estado", "Total"],
    ...lista.map((p) => [p.codigo, fecha(p.creado_en), p.tienda, p.comprador, ENTREGA[p.entrega], estadoPedidoAdmin(p).t, (p.total_centimos / 100).toFixed(2)]),
  ]);

  return (
    <>
      <Titulo titulo="Pedidos" detalle="Pedidos de toda la plataforma. VendiGo registra la información; cada tienda gestiona su entrega." />
      {!datos ? (
        <Cargando />
      ) : (
        <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
          <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
            <label className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar código, tienda o comprador…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
            </label>
            <select value={grupo} onChange={(e) => { setGrupo(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
              <option value="">Estado: todos</option>
              {Object.entries(GRUPOS_PEDIDO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            <select value={entrega} onChange={(e) => { setEntrega(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Entrega">
              <option value="">Entrega: todos</option>
              {Object.entries(ENTREGA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
            <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
          </div>
          {!lista.length ? (
            <p className="p-6 text-sm text-gris">No hay pedidos con ese filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                    <th className="px-5 py-3.5">Pedido</th>
                    <th className="px-5 py-3.5">Tienda</th>
                    <th className="px-5 py-3.5">Comprador</th>
                    <th className="px-5 py-3.5">Entrega</th>
                    <th className="px-5 py-3.5">Estado</th>
                    <th className="px-5 py-3.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => {
                    const est = estadoPedidoAdmin(p);
                    const Icono = ICONO[p.entrega];
                    return (
                      <tr key={p.id} className="relative border-b border-linea last:border-0 hover:bg-crema/40">
                        <td className="px-5 py-3.5">
                          <Link href={`/admin/pedidos/${p.codigo}`} className="after:absolute after:inset-0">
                            <b className="block text-tinta">{p.codigo}</b>
                            <span className="text-xs text-gris">{fecha(p.creado_en)}</span>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-tinta">{p.tienda}</td>
                        <td className="px-5 py-3.5 text-tinta">{p.comprador}</td>
                        <td className="px-5 py-3.5 text-tinta">
                          <span className="inline-flex items-center gap-2"><Icono className="size-4" /> {ENTREGA[p.entrega]}</span>
                        </td>
                        <td className="px-5 py-3.5"><Estado tono={est.tono}>{est.t}</Estado></td>
                        <td className="px-5 py-3.5 text-right font-bold text-tinta">{soles(p.total_centimos)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion total={lista.length} visibles={visibles.length} pagina={actual} paginas={paginas} cambiar={setPagina} />
        </section>
      )}
    </>
  );
}
