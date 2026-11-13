"use client";

import { useMemo, useState } from "react";
import { soles } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";
import Link from "next/link";
import { BotonGuardar } from "./seguir";

type Filtro = "todos" | "nuevo" | "vendidos";

// Sin tildes ni mayúsculas, para que "torta" encuentre "Tórta" y "alfajor" encuentre "Alfajores".
const plano = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Productos de la tienda en una sola fila de pestañas: Todos, Lo nuevo, Más vendidos y las categorías propias
// de la tienda. Con `q` muestra solo lo que coincide con la búsqueda hecha en la barra de la tienda.
export function Catalogo({ productos, slug, vista = false, q = "", filtroInicial = "todos" }: { productos: Producto[]; slug: string; vista?: boolean; q?: string; filtroInicial?: Filtro }) {
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial);
  const [categoria, setCategoria] = useState("");
  // Las categorías salen del tipo de cada producto (Aretes, Collares…). Solo se muestran si hay 2 o más.
  const categorias = useMemo(() => {
    const c = new Map<string, number>();
    productos.forEach((p) => p.categoria && c.set(p.categoria, (c.get(p.categoria) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [productos]);

  const lista = useMemo(() => {
    const palabras = plano(q).split(/\s+/).filter(Boolean);
    const copia = productos.filter((p) => {
      if (categoria && p.categoria !== categoria) return false;
      if (!palabras.length) return true;
      const texto = plano(`${p.nombre} ${p.categoria ?? ""} ${p.descripcion ?? ""}`);
      return palabras.every((w) => texto.includes(w));
    });
    if (filtro === "nuevo") return copia.sort((a, b) => b.creado_en.localeCompare(a.creado_en)).slice(0, 8);
    if (filtro === "vendidos") return copia.filter((p) => p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos).slice(0, 8);
    return copia;
  }, [productos, filtro, categoria, q]);

  const pestana = (activa: boolean, texto: string, alTocar: () => void) => (
    <button
      key={texto}
      onClick={alTocar}
      aria-pressed={activa}
      className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${activa ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea hover:bg-arena/60"}`}
    >
      {texto}
    </button>
  );

  return (
    <section id="productos" className="mt-12 scroll-mt-28">
      {q ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-2xl font-extrabold text-tinta">
            {lista.length} {lista.length === 1 ? "resultado" : "resultados"} para “{q}”
          </h2>
          <span className="flex gap-4 text-sm font-bold">
            <Link href={`/t/${slug}#productos`} className="text-pino hover:underline">Ver todos los productos</Link>
            <Link href={`/buscar?q=${encodeURIComponent(q)}`} className="text-gris hover:text-tinta hover:underline">Buscar en todo VendiGo</Link>
          </span>
        </div>
      ) : (
        <h2 className="text-2xl font-extrabold text-tinta">Productos</h2>
      )}

      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {pestana(filtro === "todos" && !categoria, `Todos (${productos.length})`, () => { setFiltro("todos"); setCategoria(""); })}
        {pestana(filtro === "nuevo" && !categoria, "Lo nuevo", () => { setFiltro("nuevo"); setCategoria(""); })}
        {pestana(filtro === "vendidos" && !categoria, "Más vendidos", () => { setFiltro("vendidos"); setCategoria(""); })}
        {categorias.length >= 2 && categorias.map(([c]) => pestana(categoria === c, c, () => { setFiltro("todos"); setCategoria(c); }))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {lista.map((p) => (
          <Link
            key={p.id}
            href={`/t/${slug}/p/${p.id}${vista ? "?vista=1" : ""}`}
            className="group overflow-hidden rounded-2xl bg-white shadow-suave ring-1 ring-linea/50 transition hover:-translate-y-0.5"
          >
            <div className="casilla-producto relative aspect-square">
              {p.imagenes[0] && <img src={p.imagenes[0].url} alt={p.nombre} className="foto-producto" />}
              <span className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
                {p.oferta && <span className="rounded-md bg-coral px-2 py-0.5 text-xs font-bold text-white">-{p.oferta.descuento_pct}%</span>}
                {p.destacado_hasta && <span className="rounded-md bg-pino px-2 py-0.5 text-xs font-bold text-white">Destacado</span>}
              </span>
              {/* Corazón para guardar sin entrar al producto (como en el prototipo). */}
              {!vista && (
                <span className="absolute right-2.5 top-2.5 z-10">
                  <BotonGuardar productoId={p.id} clase="grid size-10 place-items-center rounded-full bg-white/95 text-tinta shadow-suave transition hover:text-coral" />
                </span>
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
          {q ? `No encontramos “${q}” en esta tienda. Prueba con otra palabra o busca en todo VendiGo.` : productos.length ? "Aún no hay productos en esta sección." : "Esta tienda aún no publica productos."}
        </p>
      )}
    </section>
  );
}
