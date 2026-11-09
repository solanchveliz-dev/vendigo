"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Clock, RefreshCw, Search, Wallet } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { METODO_PAGO, fechaHora } from "@/lib/admin";
import { Cargando } from "@/components/ui";
import { Estado, Indicador, Paginacion, Titulo, useExportar } from "@/components/admin/ui";

type Pago = {
  pedido_id: string;
  codigo: string;
  cargo: string | null;
  tienda: string;
  comprador: string;
  metodo: string;
  estado: "retenido" | "liberado" | "pendiente" | "devuelto";
  monto_centimos: number;
  comision_centimos: number;
  liberar_en: string | null;
  creado_en: string;
};
type Resumen = { hoy: number; hoy_monto_centimos: number; retenido_centimos: number; retenido: number; liberado_mes_centimos: number; devueltos_mes: number };

const ESTADO: Record<Pago["estado"], { t: string; tono: "ok" | "aviso" | "error" | "neutro" }> = {
  retenido: { t: "Retenido", tono: "aviso" },
  liberado: { t: "Liberado a la tienda", tono: "ok" },
  pendiente: { t: "Paga al recibir", tono: "neutro" },
  devuelto: { t: "Devuelto", tono: "error" },
};
const POR_PAGINA = 20;

export default function Pagos() {
  const { datos } = useApi<{ pagos: Pago[]; resumen: Resumen }>("/admin/pagos");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [metodo, setMetodo] = useState("");
  const [pagina, setPagina] = useState(1);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.pagos ?? []).filter(
      (p) => (!estado || p.estado === estado) && (!metodo || p.metodo === metodo) && (!t || [p.codigo, p.tienda, p.comprador, p.cargo ?? ""].some((v) => v.toLowerCase().includes(t))),
    );
  }, [datos, q, estado, metodo]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("pagos", () => [
    ["Pedido", "Fecha", "Cargo Culqi", "Tienda", "Comprador", "Método", "Estado", "Monto", "Comisión"],
    ...lista.map((p) => [p.codigo, fechaHora(p.creado_en), p.cargo ?? "", p.tienda, p.comprador, METODO_PAGO[p.metodo] ?? p.metodo, ESTADO[p.estado].t, (p.monto_centimos / 100).toFixed(2), (p.comision_centimos / 100).toFixed(2)]),
  ]);

  const k = datos?.resumen;
  return (
    <>
      <Titulo titulo="Pagos registrados" detalle="Los compradores pagan con Culqi. El dinero queda retenido hasta que se confirma la entrega y luego se libera a la tienda." />
      {!datos || !k ? (
        <Cargando />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador oscuro titulo="Cobrados hoy" valor={k.hoy.toLocaleString("es-PE")} detalle={soles(k.hoy_monto_centimos)} icono={<Check className="size-4" />} />
            <Indicador titulo="Retenidos" valor={k.retenido.toLocaleString("es-PE")} detalle={`${soles(k.retenido_centimos)} esperando la entrega`} icono={<Clock className="size-4" />} />
            <Indicador titulo="Liberado (mes)" valor={soles(k.liberado_mes_centimos)} detalle="Ya es de las tiendas" icono={<Wallet className="size-4" />} />
            <Indicador titulo="Devueltos (mes)" valor={k.devueltos_mes} detalle="Por cancelación o reclamo" icono={<RefreshCw className="size-4" />} alerta={k.devueltos_mes > 0} />
          </div>
          <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
            <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
              <label className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar pedido, tienda o comprador…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
              </label>
              <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
                <option value="">Estado: todos</option>
                {Object.entries(ESTADO).map(([k, e]) => <option key={k} value={k}>{e.t}</option>)}
              </select>
              <select value={metodo} onChange={(e) => { setMetodo(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Método">
                <option value="">Método: todos</option>
                {Object.entries(METODO_PAGO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
              <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
            </div>
            {!lista.length ? (
              <p className="p-6 text-sm text-gris">No hay pagos con ese filtro.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                      <th className="px-5 py-3.5">Pedido</th>
                      <th className="px-5 py-3.5">Tienda</th>
                      <th className="px-5 py-3.5">Comprador</th>
                      <th className="px-5 py-3.5">Método</th>
                      <th className="px-5 py-3.5">Estado</th>
                      <th className="px-5 py-3.5 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((p) => (
                      <tr key={p.pedido_id} className="relative border-b border-linea last:border-0 hover:bg-crema/40">
                        <td className="px-5 py-3.5">
                          <Link href={`/admin/pedidos/${p.codigo}`} className="after:absolute after:inset-0">
                            <b className="block text-tinta">{p.codigo}</b>
                            <span className="text-xs text-gris">{fechaHora(p.creado_en)}</span>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-tinta">{p.tienda}</td>
                        <td className="px-5 py-3.5 text-tinta">{p.comprador}</td>
                        <td className="px-5 py-3.5 text-tinta">{METODO_PAGO[p.metodo] ?? p.metodo}</td>
                        <td className="px-5 py-3.5"><Estado tono={ESTADO[p.estado].tono}>{ESTADO[p.estado].t}</Estado></td>
                        <td className="px-5 py-3.5 text-right font-bold text-tinta">{soles(p.monto_centimos)}</td>
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
