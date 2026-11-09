"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Package, Search } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { ESTADO_PRODUCTO, RUBROS, type ProductoAdmin } from "@/lib/admin";
import { Cargando } from "@/components/ui";
import { Estado, Paginacion, Titulo, useExportar } from "@/components/admin/ui";

const POR_PAGINA = 20;

export default function Productos() {
  const { datos } = useApi<{ productos: ProductoAdmin[] }>("/admin/productos");
  const [q, setQ] = useState("");
  const [rubro, setRubro] = useState("");
  const [estado, setEstado] = useState("");
  const [pagina, setPagina] = useState(1);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.productos ?? []).filter(
      (p) => (!rubro || p.rubro === rubro) && (!estado || p.estado === estado) && (!t || [p.nombre, p.tienda, p.categoria].some((v) => v.toLowerCase().includes(t))),
    );
  }, [datos, q, rubro, estado]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("productos", () => [
    ["Producto", "Tienda", "Categoría", "Precio", "Stock", "Estado"],
    ...lista.map((p) => [p.nombre, p.tienda, RUBROS[p.rubro] ?? p.rubro, (p.precio_centimos / 100).toFixed(2), p.stock, ESTADO_PRODUCTO[p.estado].t]),
  ]);

  return (
    <>
      <Titulo titulo="Productos" detalle="Publicaciones de todas las tiendas." />
      {!datos ? (
        <Cargando />
      ) : (
        <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
          <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
            <label className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar producto o tienda…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
            </label>
            <select value={rubro} onChange={(e) => { setRubro(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Categoría">
              <option value="">Categoría: todos</option>
              {Object.entries(RUBROS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
              <option value="">Estado: todos</option>
              {Object.entries(ESTADO_PRODUCTO).map(([k, e]) => <option key={k} value={k}>{e.t}</option>)}
            </select>
            <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
          </div>
          {!lista.length ? (
            <p className="p-6 text-sm text-gris">No hay productos con ese filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                    <th className="px-5 py-3.5">Producto</th>
                    <th className="px-5 py-3.5">Tienda</th>
                    <th className="px-5 py-3.5">Categoría</th>
                    <th className="px-5 py-3.5 text-right">Precio</th>
                    <th className="px-5 py-3.5 text-right">Stock</th>
                    <th className="px-5 py-3.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => (
                    <tr key={p.id} className="relative border-b border-linea last:border-0 hover:bg-crema/40">
                      <td className="px-5 py-3">
                        <Link href={`/admin/productos/${p.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                          <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-crema text-tinta/60">
                            <Package className="size-5" />
                            {p.imagen_url && <img src={p.imagen_url} alt="" onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 size-full object-cover" />}
                          </span>
                          <span className="min-w-0">
                            <b className="block truncate text-tinta">{p.nombre}</b>
                            {p.oferta_pct > 0 && <span className="text-xs font-bold text-coral">-{p.oferta_pct}% en oferta</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-tinta">{p.tienda}</td>
                      <td className="px-5 py-3 text-tinta">{RUBROS[p.rubro] ?? p.rubro}</td>
                      <td className="px-5 py-3 text-right text-tinta">{soles(p.precio_centimos)}</td>
                      <td className="px-5 py-3 text-right text-tinta">{p.stock}</td>
                      <td className="px-5 py-3"><Estado tono={ESTADO_PRODUCTO[p.estado].tono}>{ESTADO_PRODUCTO[p.estado].t}</Estado></td>
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
