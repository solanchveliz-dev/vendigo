"use client";

import Link from "next/link";
import { useState } from "react";
import { Heart } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { Cargando, cn } from "@/components/ui";
import { Titulo } from "@/components/admin/ui";
import { TarjetaTienda, Vacio, type TiendaFav } from "@/components/comprador/ui";

type ProductoFav = { id: string; nombre: string; precio_centimos: number; precio_final_centimos: number; imagen_url: string; tienda: string; tienda_slug: string; agotado: boolean };

// Favoritos (prototipo n.° 12): los emprendedores que sigue y los productos que guardó.
export default function Favoritos() {
  const { datos, recargar } = useApi<{ tiendas: TiendaFav[]; productos: ProductoFav[] }>("/comprador/favoritos");
  const [pestana, setPestana] = useState<"tiendas" | "productos">("tiendas");

  async function quitar(tipo: "tiendas" | "productos", id: string) {
    await api.del(`/comprador/favoritos/${tipo}/${id}`).catch(() => null);
    recargar();
  }

  if (!datos) return <Cargando />;
  const vacio = !datos.tiendas.length && !datos.productos.length;

  return (
    <div className="space-y-6">
      <Titulo titulo="Favoritos" detalle="Los emprendedores que sigues y lo que guardaste." migas={<><Link href="/mi-cuenta" className="hover:text-tinta">Inicio</Link> / Favoritos</>} />
      {vacio ? (
        <Vacio titulo="Aún no guardas favoritos" texto="Toca el corazón en una tienda para seguirla, o en un producto para guardarlo y encontrarlo rápido.">
          <Link href="/buscar" className="inline-flex h-11 items-center rounded-full bg-pino px-6 text-sm font-bold text-white">Buscar emprendedores</Link>
        </Vacio>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-linea">
            {([["tiendas", `Emprendedores (${datos.tiendas.length})`], ["productos", `Productos guardados (${datos.productos.length})`]] as const).map(([k, t]) => (
              <button key={k} onClick={() => setPestana(k)} className={cn("-mb-px border-b-2 px-3 pb-3 text-[15px] font-semibold transition", pestana === k ? "border-coral text-tinta" : "border-transparent text-gris hover:text-tinta")}>{t}</button>
            ))}
          </div>

          {pestana === "tiendas" &&
            (datos.tiendas.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {datos.tiendas.map((t) => <TarjetaTienda key={t.id} t={t} alQuitar={() => quitar("tiendas", t.id)} />)}
              </div>
            ) : (
              <Vacio titulo="Aún no sigues a nadie" texto="Toca el corazón en la página de una tienda para seguirla." />
            ))}

          {pestana === "productos" &&
            (datos.productos.length ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {datos.productos.map((p) => (
                  <div key={p.id} className="relative overflow-hidden rounded-[22px] bg-white shadow-suave ring-1 ring-linea/60">
                    <button onClick={() => quitar("productos", p.id)} className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-white/90 text-coral shadow-suave" aria-label="Quitar de favoritos" title="Quitar de favoritos">
                      <Heart className="size-[18px] fill-current" />
                    </button>
                    <Link href={`/t/${p.tienda_slug}/p/${p.id}`} className="block">
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen_url} alt="" className="aspect-square w-full object-cover" />
                      ) : (
                        <span className="block aspect-square w-full bg-crema" />
                      )}
                      <span className="block p-4">
                        <span className="block truncate text-xs font-semibold text-gris">{p.tienda}</span>
                        <b className="block truncate text-tinta">{p.nombre}</b>
                        <span className="mt-1 flex items-center gap-2">
                          <b className="text-pino">{soles(p.precio_final_centimos)}</b>
                          {p.precio_final_centimos < p.precio_centimos && <s className="text-xs text-gris">{soles(p.precio_centimos)}</s>}
                          {p.agotado && <span className="ml-auto rounded-full bg-error-claro px-2 py-0.5 text-[11px] font-bold text-error">Agotado</span>}
                        </span>
                      </span>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <Vacio titulo="No guardaste productos" texto="Toca el corazón en un producto de cualquier tienda." />
            ))}
        </>
      )}
    </div>
  );
}
