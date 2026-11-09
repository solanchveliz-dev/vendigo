"use client";

import { useMemo, useState } from "react";
import { soles } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";
import Link from "next/link";

type Filtro = "todos" | "nuevo" | "vendidos";

// Productos de la tienda con filtros: Todos, Lo nuevo y Más vendidos, y las categorías propias de la tienda.
export function Catalogo({ productos, slug }: { productos: Producto[]; slug: string }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [categoria, setCategoria] = useState("");
  // Las categorías salen del tipo de cada producto (Aretes, Collares…). Solo se muestran si hay 2 o más.
  const categorias = useMemo(() => {
    const c = new Map<string, number>();
    productos.forEach((p) => p.categoria && c.set(p.categoria, (c.get(p.categoria) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [productos]);

  const lista = useMemo(() => {
    const copia = productos.filter((p) => !categoria || p.categoria === categoria);
    if (filtro === "nuevo") return copia.sort((a, b) => b.creado_en.localeCompare(a.creado_en)).slice(0, 8);
    if (filtro === "vendidos") return copia.filter((p) => p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, 8);
    return copia;
  }, [productos, filtro, categoria]);

  const boton = (k: Filtro, texto: string) => (
    <button
      key={k}
      onClick={() => setFiltro(k)}
      className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filtro === k ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea hover:bg-arena/60"}`}
    >
      {texto}
    </button>
  );

  return (
    <section id="productos" className="mt-12 scroll-mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold text-tinta">Productos de la tienda</h2>
        <div className="flex gap-2">
          {boton("todos", `Todos (${productos.length})`)}
          {boton("nuevo", "Lo nuevo")}
          {boton("vendidos", "Más vendidos")}
        </div>
      </div>

      {categorias.length >= 2 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {[["", productos.length] as [string, number], ...categorias].map(([c, n]) => (
            <button
              key={c || "todas"}
              onClick={() => setCategoria(c)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${categoria === c ? "bg-coral text-white" : "bg-white/70 text-tinta ring-1 ring-linea hover:bg-arena/60"}`}
            >
              {c || "Todas las categorías"} <span className="opacity-70">({n})</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {lista.map((p) => (
          <Link
            key={p.id}
            href={`/t/${slug}/p/${p.id}`}
            className="group overflow-hidden rounded-2xl bg-white shadow-suave ring-1 ring-linea/50 transition hover:-translate-y-0.5"
          >
            <div className="relative aspect-square bg-arena">
              {p.imagenes[0] && <img src={p.imagenes[0].url} alt={p.nombre} className="size-full object-cover" />}
              {p.oferta && (
                <span className="absolute left-2.5 top-2.5 rounded-md bg-coral px-2 py-0.5 text-xs font-bold text-white">-{p.oferta.descuento_pct}%</span>
              )}
            </div>
            <div className="flex items-end justify-between gap-2 p-3.5">
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-bold text-tinta">{p.nombre}</p>
                <p className="mt-1 text-sm text-gris">
                  {soles(p.oferta?.precio_final_centimos ?? p.precio_centimos)}
                  {p.oferta && <span className="ml-1.5 text-xs line-through">{soles(p.precio_centimos)}</span>}
                </p>
              </div>
              {p.stock === 0 && <span className="shrink-0 text-xs font-semibold text-error">Agotado</span>}
            </div>
          </Link>
        ))}
      </div>

      {!lista.length && (
        <p className="mt-8 rounded-2xl bg-white/70 p-8 text-center text-gris">
          {productos.length ? "Aún no hay productos en esta sección." : "Esta tienda aún no publica productos."}
        </p>
      )}
    </section>
  );
}
