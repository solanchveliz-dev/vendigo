"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, Store } from "lucide-react";
import { useApi } from "@/lib/api";
import { ESTADO_TIENDA, REPUTACION, RUBROS, type TiendaAdmin } from "@/lib/admin";
import { Cargando } from "@/components/ui";
import { Estado, Paginacion, Titulo, useExportar } from "@/components/admin/ui";
import { AccionTienda } from "@/components/admin/acciones-tienda";

const POR_PAGINA = 20;

export default function Tiendas() {
  const { datos, recargar } = useApi<{ tiendas: TiendaAdmin[] }>("/admin/tiendas");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [rubro, setRubro] = useState("");
  const [pagina, setPagina] = useState(1);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.tiendas ?? []).filter(
      (x) => (!estado || x.estado === estado) && (!rubro || x.rubro === rubro) && (!t || [x.nombre, x.dueno, x.lugar].some((v) => v.toLowerCase().includes(t))),
    );
  }, [datos, q, estado, rubro]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("tiendas", () => [
    ["Tienda", "Categoría", "Ubicación", "Dueña", "Productos", "Ventas", "Reputación", "Estado"],
    ...lista.map((t) => [t.nombre, RUBROS[t.rubro] ?? t.rubro, t.lugar, t.dueno, t.productos, t.ventas, REPUTACION[t.reputacion] ?? t.reputacion, ESTADO_TIENDA[t.estado].t]),
  ]);

  return (
    <>
      <Titulo
        titulo="Tiendas"
        detalle="Todas las tiendas de la plataforma. Las nuevas se publican al instante y quedan en revisión hasta que las apruebes."
        accion={
          <button onClick={() => setEstado(estado === "suspendida" ? "" : "suspendida")} className="h-11 rounded-full bg-white px-5 text-sm font-bold text-tinta ring-1 ring-linea">
            {estado === "suspendida" ? "Ver todas" : "Activas / suspendidas"}
          </button>
        }
      />
      {!datos ? (
        <Cargando />
      ) : (
        <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
          <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
            <label className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar tienda…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
            </label>
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
              <option value="">Estado: todos</option>
              {Object.entries(ESTADO_TIENDA).map(([k, e]) => <option key={k} value={k}>{e.t}</option>)}
            </select>
            <select value={rubro} onChange={(e) => { setRubro(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Categoría">
              <option value="">Categoría: todos</option>
              {Object.entries(RUBROS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
            <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
          </div>
          {!lista.length ? (
            <p className="p-6 text-sm text-gris">No hay tiendas con ese filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                    <th className="px-5 py-3.5">Tienda</th>
                    <th className="px-5 py-3.5 text-right">Productos</th>
                    <th className="px-5 py-3.5 text-right">Ventas</th>
                    <th className="px-5 py-3.5">Reputación</th>
                    <th className="px-5 py-3.5">Estado</th>
                    <th className="px-5 py-3.5" />
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((t) => (
                    <tr key={t.id} className="border-b border-linea last:border-0 hover:bg-crema/40">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/tiendas/${t.id}`} className="flex items-center gap-3">
                          <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-crema text-tinta">
                            <Store className="size-5" />
                            {t.logo_url && <img src={t.logo_url} alt="" onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 size-full object-cover" />}
                          </span>
                          <span>
                            <b className="block text-tinta">{t.nombre}</b>
                            <span className="text-xs text-gris">{RUBROS[t.rubro] ?? t.rubro} · {t.lugar}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-right text-tinta">{t.productos}</td>
                      <td className="px-5 py-3.5 text-right text-tinta">{t.ventas.toLocaleString("es-PE")}</td>
                      <td className="px-5 py-3.5 font-semibold text-tinta">{REPUTACION[t.reputacion] ?? t.reputacion}</td>
                      <td className="px-5 py-3.5"><Estado tono={ESTADO_TIENDA[t.estado].tono}>{ESTADO_TIENDA[t.estado].t}</Estado></td>
                      <td className="px-5 py-3.5 text-right"><AccionTienda t={t} alTerminar={recargar} /></td>
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
