"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApi } from "@/lib/api";
import { estadoVendedora, type Vendedora } from "@/lib/admin";
import { Cargando } from "@/components/ui";
import { Avatar, Estado, Paginacion, Titulo, useExportar } from "@/components/admin/ui";

const POR_PAGINA = 20;
const REPUTACION: Record<string, string> = { nueva: "Tienda nueva", buena: "Buena", excelente: "Excelente" };

export default function Vendedores() {
  const { datos } = useApi<{ vendedoras: Vendedora[] }>("/admin/vendedores");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQ(p.get("q") ?? "");
    setEstado(p.get("estado") ?? "");
  }, []);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.vendedoras ?? []).filter(
      (v) =>
        (!estado || estadoVendedora(v).clave === estado) &&
        (!t || [v.nombre, v.email, v.celular, v.tienda].some((x) => x.toLowerCase().includes(t))),
    );
  }, [datos, q, estado]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("vendedores", () => [
    ["Vendedor", "Correo", "Celular", "Tienda", "Plan", "Pedidos", "Ventas (S/)", "Estado", "Registro"],
    ...lista.map((v) => [v.nombre, v.email, v.celular, v.tienda, v.plan, v.pedidos, (v.ventas_centimos / 100).toFixed(2), estadoVendedora(v).t, v.creado_en.slice(0, 10)]),
  ]);

  return (
    <>
      <Titulo titulo="Vendedores" detalle="Cuentas con tienda y su plan." />
      {!datos ? (
        <Cargando />
      ) : (
        <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
          <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
            <label className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
            </label>
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
              <option value="">Estado: todos</option>
              <option value="activas">Activos</option>
              <option value="pendientes">Pendientes (identidad)</option>
              <option value="suspendidas">Suspendidos</option>
            </select>
            <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
          </div>
          {!lista.length ? (
            <p className="p-6 text-sm text-gris">No hay vendedores con ese filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                    <th className="px-5 py-3.5">Vendedor</th>
                    <th className="px-5 py-3.5">Tienda</th>
                    <th className="px-5 py-3.5">Plan</th>
                    <th className="px-5 py-3.5 text-right">Ventas</th>
                    <th className="px-5 py-3.5">Reputación</th>
                    <th className="px-5 py-3.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((v) => {
                    const e = estadoVendedora(v);
                    return (
                      <tr key={v.id} className="border-b border-linea last:border-0 hover:bg-crema/40">
                        <td className="px-5 py-3.5">
                          <Link href={`/admin/vendedores/${v.id}`} className="flex items-center gap-3">
                            <Avatar nombre={v.nombre} />
                            <span>
                              <b className="block text-tinta">{v.nombre}</b>
                              <span className="text-xs text-gris">{v.email || v.celular}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-tinta">{v.tienda || <span className="text-gris">Sin tienda</span>}</td>
                        <td className="px-5 py-3.5 font-bold text-tinta">{v.plan || "—"}</td>
                        <td className="px-5 py-3.5 text-right text-tinta">{v.pedidos.toLocaleString("es-PE")}</td>
                        <td className="px-5 py-3.5 font-semibold text-tinta">{REPUTACION[v.reputacion ?? ""] ?? "—"}</td>
                        <td className="px-5 py-3.5"><Estado tono={e.tono}>{e.t}</Estado></td>
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
