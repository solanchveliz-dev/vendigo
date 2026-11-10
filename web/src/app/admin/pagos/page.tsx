"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Clock, RefreshCw, Search, Truck } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { fechaHora } from "@/lib/admin";
import { DEVOLUCION, EtiquetaPago, METODOS, ORIGEN } from "@/components/pagos/estado";
import { Cargando } from "@/components/ui";
import { Indicador, Paginacion, Titulo, useExportar } from "@/components/admin/ui";

type Pago = {
  pedido_id: string;
  codigo: string;
  tienda: string;
  comprador: string;
  metodo: string;
  momento: "antes" | "adelanto" | "al_recibir";
  estado: string;
  estado_texto: string;
  origen: "tienda" | "proveedor" | "prueba";
  monto_centimos: number;
  referencia: string;
  informado_en: string | null;
  devolucion: string | null;
  creado_en: string;
};
type Resumen = { informados_hoy: number; informados_hoy_centimos: number; por_confirmar: number; al_recibir: number; devoluciones_pendientes: number; devoluciones_pendientes_centimos: number };

const ESTADOS: Record<string, string> = {
  pendiente: "Pendiente de pago",
  comprobante_enviado: "Comprobante enviado",
  paga_al_recibir: "Paga al recibir",
  adelanto_informado: "Adelanto recibido",
  informado_tienda: "Pago informado por la tienda",
  no_recibido: "La tienda no lo recibió",
  de_prueba: "Pedido de prueba",
};
const MOMENTO = { antes: "Completo antes", adelanto: "Adelanto + resto al recibir", al_recibir: "Al recibir" };
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
      (p) => (!estado || p.estado === estado) && (!metodo || p.metodo === metodo) && (!t || [p.codigo, p.tienda, p.comprador, p.referencia].some((v) => v.toLowerCase().includes(t))),
    );
  }, [datos, q, estado, metodo]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("pagos", () => [
    ["Pedido", "Fecha", "Tienda", "Comprador", "Método", "Cuándo", "Estado", "Origen", "Referencia", "Monto", "Devolución"],
    ...lista.map((p) => [p.codigo, fechaHora(p.creado_en), p.tienda, p.comprador, METODOS[p.metodo] ?? p.metodo, MOMENTO[p.momento], p.estado_texto, ORIGEN[p.origen], p.referencia, (p.monto_centimos / 100).toFixed(2), p.devolucion ? DEVOLUCION[p.devolucion as keyof typeof DEVOLUCION] ?? p.devolucion : ""]),
  ]);

  const k = datos?.resumen;
  return (
    <>
      <Titulo titulo="Pagos registrados" detalle="El comprador le paga directo a la tienda (Yape, Plin, transferencia o el link de tarjeta de la tienda). VendiGo no recibe ni guarda ese dinero: aquí solo ves el seguimiento que informan comprador y tienda." />
      {!datos || !k ? (
        <Cargando />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador oscuro titulo="Informados hoy" valor={k.informados_hoy.toLocaleString("es-PE")} detalle={`${soles(k.informados_hoy_centimos)} según las tiendas`} icono={<Check className="size-4" />} />
            <Indicador titulo="Por confirmar" valor={k.por_confirmar.toLocaleString("es-PE")} detalle="La tienda aún no revisa el pago" icono={<Clock className="size-4" />} alerta={k.por_confirmar > 0} />
            <Indicador titulo="Pagan al recibir" valor={k.al_recibir.toLocaleString("es-PE")} detalle="Se cobra en la entrega" icono={<Truck className="size-4" />} />
            <Indicador titulo="Devoluciones pendientes" valor={k.devoluciones_pendientes} detalle={`${soles(k.devoluciones_pendientes_centimos)} que la tienda debe devolver`} icono={<RefreshCw className="size-4" />} alerta={k.devoluciones_pendientes > 0} />
          </div>
          <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
            <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
              <label className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar pedido, tienda o comprador…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
              </label>
              <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
                <option value="">Estado: todos</option>
                {Object.entries(ESTADOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
              <select value={metodo} onChange={(e) => { setMetodo(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Método">
                <option value="">Método: todos</option>
                {["yape_directo", "plin_directo", "tarjeta_tienda", "transferencia_tienda"].map((k) => <option key={k} value={k}>{METODOS[k]}</option>)}
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
                      <th className="px-5 py-3.5">Referencia</th>
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
                        <td className="px-5 py-3.5 text-tinta">
                          {METODOS[p.metodo] ?? p.metodo}
                          <span className="block text-xs text-gris">{MOMENTO[p.momento]}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <EtiquetaPago estado={p.estado} texto={p.estado_texto} />
                          {p.devolucion && p.devolucion !== "de_prueba" && <span className="mt-1 block text-xs text-error">{DEVOLUCION[p.devolucion as keyof typeof DEVOLUCION] ?? p.devolucion}</span>}
                        </td>
                        <td className="px-5 py-3.5 text-gris">{p.referencia || "—"}</td>
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
