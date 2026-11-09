"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApi } from "@/lib/api";
import { ESTADO_INCIDENCIA, PRIORIDAD, TIPO_INCIDENCIA, codigoInc, fecha, type Incidencia } from "@/lib/admin";
import { Cargando } from "@/components/ui";
import { Estado, Paginacion, Titulo, useExportar } from "@/components/admin/ui";
import { NuevaIncidencia } from "@/components/admin/nueva-incidencia";

const POR_PAGINA = 20;

export default function Incidencias() {
  const { datos } = useApi<{ incidencias: Incidencia[] }>("/admin/incidencias");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [pagina, setPagina] = useState(1);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.incidencias ?? []).filter(
      (i) => (!estado || i.estado === estado) && (!prioridad || i.prioridad === prioridad) && (!t || [codigoInc(i.numero), i.titulo, i.tienda ?? "", i.pedido ?? ""].some((v) => v.toLowerCase().includes(t))),
    );
  }, [datos, q, estado, prioridad]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("incidencias", () => [
    ["Código", "Incidencia", "Tipo", "Tienda", "Pedido", "Prioridad", "Estado", "Fecha"],
    ...lista.map((i) => [codigoInc(i.numero), i.titulo, TIPO_INCIDENCIA[i.tipo], i.tienda ?? "", i.pedido ?? "", PRIORIDAD[i.prioridad].t, ESTADO_INCIDENCIA[i.estado].t, fecha(i.creado_en)]),
  ]);

  return (
    <>
      <Titulo titulo="Incidencias" detalle="Reportes de compradores, vendedores y del equipo." accion={<NuevaIncidencia texto="Nueva incidencia" />} />
      {!datos ? (
        <Cargando />
      ) : (
        <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
          <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
            <label className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar código, tienda o pedido…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
            </label>
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
              <option value="">Estado: todos</option>
              {Object.entries(ESTADO_INCIDENCIA).map(([k, e]) => <option key={k} value={k}>{e.t}</option>)}
            </select>
            <select value={prioridad} onChange={(e) => { setPrioridad(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Prioridad">
              <option value="">Prioridad: todos</option>
              {Object.entries(PRIORIDAD).map(([k, e]) => <option key={k} value={k}>{e.t}</option>)}
            </select>
            <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
          </div>
          {!lista.length ? (
            <p className="p-6 text-sm text-gris">{datos.incidencias.length ? "No hay incidencias con ese filtro." : "Todavía no hay incidencias. Ábrelas desde un pedido o con “Nueva incidencia”."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                    <th className="px-5 py-3.5">Código</th>
                    <th className="px-5 py-3.5">Incidencia</th>
                    <th className="px-5 py-3.5">Tipo</th>
                    <th className="px-5 py-3.5">Tienda</th>
                    <th className="px-5 py-3.5">Prioridad</th>
                    <th className="px-5 py-3.5">Estado</th>
                    <th className="px-5 py-3.5">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((i) => (
                    <tr key={i.id} className="relative border-b border-linea last:border-0 hover:bg-crema/40">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/incidencias/${codigoInc(i.numero)}`} className="font-bold text-tinta after:absolute after:inset-0">{codigoInc(i.numero)}</Link>
                      </td>
                      <td className="px-5 py-3.5 text-tinta">{i.titulo}</td>
                      <td className="px-5 py-3.5 text-tinta">{TIPO_INCIDENCIA[i.tipo]}</td>
                      <td className="px-5 py-3.5 text-tinta">{i.tienda ?? "—"}</td>
                      <td className="px-5 py-3.5"><Estado tono={PRIORIDAD[i.prioridad].tono}>{PRIORIDAD[i.prioridad].t}</Estado></td>
                      <td className="px-5 py-3.5"><Estado tono={ESTADO_INCIDENCIA[i.estado].tono}>{ESTADO_INCIDENCIA[i.estado].t}</Estado></td>
                      <td className="px-5 py-3.5 text-tinta">{fecha(i.creado_en)}</td>
                    </tr>
                  ))}
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
