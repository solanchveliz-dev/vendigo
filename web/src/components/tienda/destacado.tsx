import Link from "next/link";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { soles } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";

// Banner del producto destacado. "Ver producto" abre su página.
export function Destacado({ producto: p, slug, etiqueta, texto, vista = false }: { producto: Producto; slug: string; etiqueta: string; texto: string; vista?: boolean }) {
  const href = `/t/${slug}/p/${p.id}${vista ? "?vista=1" : ""}`;
  return (
    <section className="mt-10 grid overflow-hidden rounded-[28px] bg-pino p-2 sm:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col justify-center gap-3 p-8 text-white sm:p-10">
        <span className="w-fit rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-widest">{etiqueta}</span>
        <h2 className="text-3xl font-extrabold">{p.nombre}</h2>
        <p className="text-white/75">
          {texto} · {soles(p.oferta?.precio_final_centimos ?? p.precio_centimos)}
        </p>
        <Link href={href} className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-pino transition hover:bg-crema">
          <ShoppingBag className="size-4" /> Ver producto <ChevronRight className="size-4" />
        </Link>
      </div>
      <Link href={href} className="relative aspect-[4/3] overflow-hidden rounded-[22px] bg-white sm:aspect-auto sm:min-h-[340px]" aria-label={`Ver ${p.nombre}`}>
        {p.imagenes[0] && <img src={p.imagenes[0].url} alt={p.nombre} className="absolute inset-0 size-full object-cover transition duration-500 hover:scale-105" />}
      </Link>
    </section>
  );
}
