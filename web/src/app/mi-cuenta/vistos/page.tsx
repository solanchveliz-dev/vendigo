"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { soles } from "@/lib/formato";
import { borrarVistos, leerVistos, type Visto } from "@/lib/vistos";
import { Boton } from "@/components/ui";
import { Titulo } from "@/components/admin/ui";
import { Vacio } from "@/components/comprador/ui";

// Vistos recientemente (prototipo): los últimos productos que abriste en este navegador.
export default function Vistos() {
  const [lista, setLista] = useState<Visto[] | null>(null);
  useEffect(() => setLista(leerVistos()), []);
  if (!lista) return null;

  return (
    <div className="space-y-6">
      <Titulo
        titulo="Vistos recientemente"
        detalle="Los últimos productos que abriste en este navegador."
        accion={lista.length > 0 && <Boton variante="secundario" onClick={() => { borrarVistos(); setLista([]); }}>Borrar historial</Boton>}
      />
      {!lista.length ? (
        <Vacio titulo="Aún no viste productos" texto="Cuando abras un producto de cualquier tienda, aparecerá aquí para que lo encuentres rápido.">
          <Link href="/buscar" className="inline-flex h-11 items-center rounded-full bg-pino px-6 text-sm font-bold text-white">Explorar</Link>
        </Vacio>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {lista.map((v) => (
            <Link key={v.id} href={`/t/${v.slug}/p/${v.id}`} className="overflow-hidden rounded-[22px] bg-white shadow-suave ring-1 ring-linea/60 transition hover:ring-pino/40">
              {v.imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.imagen} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <span className="block aspect-square w-full bg-crema" />
              )}
              <span className="block p-4">
                <span className="block truncate text-xs font-semibold text-gris">{v.tienda}</span>
                <b className="block truncate text-tinta">{v.nombre}</b>
                <b className="mt-1 block text-pino">{soles(v.precio)}</b>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
