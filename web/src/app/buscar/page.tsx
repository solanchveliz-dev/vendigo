import type { Metadata } from "next";
import Link from "next/link";
import { Bike, ChevronRight, MapPin, Package, Star, Store } from "lucide-react";
import { API_URL } from "@/lib/servidor/sesion";
import { soles } from "@/lib/formato";
import { rubros } from "@/lib/catalogos";
import { CabeceraPublica } from "@/components/tienda/cabecera";
import { PieLegal } from "@/components/legal/pie";

type Prod = { id: string; nombre: string; precio_final_centimos: number; descuento_pct: number; imagen_url: string; destacado: boolean };
type TiendaR = {
  id: string; nombre: string; slug: string; rubro: string; descripcion: string; lugar: string; logo_url: string;
  reputacion: string; ventas: number; entregas: string[]; productos: Prod[];
};
type Destacado = { id: string; nombre: string; precio_final_centimos: number; precio_centimos: number; tienda_slug: string; tienda: string; imagen_url: string };
type Resultado = { q: string; destacados: Destacado[]; tiendas: TiendaR[] };
type Busqueda = { q?: string; rubro?: string; ciudad?: string; entrega?: string; orden?: string };

const REPUTACION: Record<string, string> = { nueva: "Tienda nueva", buena: "Buena reputación", excelente: "Excelente reputación" };
const ENTREGA_ICONO: Record<string, React.ReactNode> = { recojo: <Store className="size-4" />, agencia: <Package className="size-4" />, motorizado: <Bike className="size-4" /> };

export async function generateMetadata({ searchParams }: { searchParams: Promise<Busqueda> }): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `${q} · Buscar en VendiGo` : "Explora VendiGo" };
}

async function buscar(b: Busqueda): Promise<Resultado> {
  const qs = new URLSearchParams(Object.entries(b).filter(([, v]) => v) as [string, string][]);
  const r = await fetch(`${API_URL}/api/v1/buscar?${qs}`, { cache: "no-store" });
  return r.ok ? r.json() : { q: b.q ?? "", destacados: [], tiendas: [] };
}

// Explorar y buscar en VendiGo: los productos impulsados salen arriba con la etiqueta "Destacado".
export default async function Buscar({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const b = await searchParams;
  const r = await buscar(b);
  const enlace = (cambio: Partial<Busqueda>) => {
    const x = new URLSearchParams(Object.entries({ ...b, ...cambio }).filter(([, v]) => v) as [string, string][]);
    return `/buscar?${x}`;
  };

  return (
    <div className="min-h-screen bg-crema">
      <CabeceraPublica q={b.q ?? ""} />
      <main className="mx-auto max-w-[1400px] px-5 pb-16 pt-6 sm:px-10">
        <section className="relative overflow-hidden rounded-[28px] bg-pino px-8 py-9 text-white">
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">{b.q ? "Resultados" : "Explora VendiGo"}</p>
          <h1 className="mt-1 text-[34px] font-extrabold leading-tight">
            {b.q ? <>Lo que estás <span className="font-serif italic text-coral">buscando</span></> : <>Encuentra tu tienda <span className="font-serif italic text-coral">favorita</span></>}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-white/80">Productos y tiendas de emprendedores. Le pagas directo a la tienda y sigues tu pedido en VendiGo.</p>
          <form action="/buscar" className="mt-5 flex max-w-xl items-center gap-2 rounded-full bg-white py-1 pl-4 pr-1 md:hidden">
            <input name="q" defaultValue={b.q} placeholder="¿Qué buscas?" className="h-9 min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none" />
            <button className="h-9 rounded-full bg-coral px-4 text-sm font-bold text-white">Buscar</button>
          </form>
          <div className="absolute -right-10 -top-16 size-56 rounded-full bg-white/5" />
        </section>

        <nav className="my-4 flex items-center gap-1.5 text-sm text-gris">
          <Link href="/" className="hover:text-tinta">Inicio</Link> <ChevronRight className="size-3.5" /> <span className="text-tinta">Buscar</span>
          {b.q && <><ChevronRight className="size-3.5" /> <span className="text-tinta">“{b.q}”</span></>}
        </nav>

        <section className="space-y-3 rounded-[22px] bg-white p-4 shadow-suave ring-1 ring-linea/60">
          <div className="flex flex-wrap gap-2">
            <Link href={enlace({ rubro: "" })} className={`rounded-full px-4 py-2 text-sm font-semibold ${!b.rubro ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea"}`}>Todos los rubros</Link>
            {Object.entries(rubros).map(([k, v]) => (
              <Link key={k} href={enlace({ rubro: k })} className={`rounded-full px-4 py-2 text-sm font-semibold ${b.rubro === k ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea"}`}>{v}</Link>
            ))}
          </div>
          <form action="/buscar" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="q" value={b.q ?? ""} />
            <input type="hidden" name="rubro" value={b.rubro ?? ""} />
            <input name="ciudad" defaultValue={b.ciudad} placeholder="Ciudad o distrito" className="h-10 w-44 rounded-full bg-white px-4 text-sm ring-1 ring-linea outline-none" />
            <select name="entrega" defaultValue={b.entrega ?? ""} className="h-10 rounded-full bg-white px-4 text-sm ring-1 ring-linea">
              <option value="">Entrega: todas</option>
              <option value="recojo">Recojo en tienda</option>
              <option value="agencia">Envío por agencia</option>
              <option value="motorizado">Delivery</option>
            </select>
            <select name="orden" defaultValue={b.orden ?? ""} className="h-10 rounded-full bg-white px-4 text-sm ring-1 ring-linea">
              <option value="">Más relevantes</option>
              <option value="ventas">Más ventas</option>
              <option value="nuevas">Más nuevas</option>
            </select>
            <button className="h-10 rounded-full bg-pino px-5 text-sm font-bold text-white">Aplicar</button>
            <span className="ml-auto text-sm text-gris">{r.tiendas.length} {r.tiendas.length === 1 ? "emprendedor" : "emprendedores"}</span>
          </form>
        </section>

        {r.destacados.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-3 font-extrabold text-tinta">Destacados{b.q ? ` para “${b.q}”` : ""}</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {r.destacados.map((p) => (
                <Link key={p.id} href={`/t/${p.tienda_slug}/p/${p.id}`} className="overflow-hidden rounded-2xl bg-white shadow-suave ring-1 ring-linea/60 transition hover:-translate-y-0.5">
                  <div className="casilla-producto relative aspect-square">
                    {p.imagen_url && <img src={p.imagen_url} alt={p.nombre} className="foto-producto" />}
                    <span className="absolute right-2.5 top-2.5 rounded-md bg-pino px-2 py-0.5 text-xs font-bold text-white">Destacado</span>
                  </div>
                  <div className="p-3.5">
                    <p className="truncate text-sm font-semibold text-tinta">{p.nombre}</p>
                    <p className="truncate text-xs text-gris">{p.tienda}</p>
                    <p className="mt-1 font-display font-extrabold text-tinta">{soles(p.precio_final_centimos)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {!r.tiendas.length ? (
          <section className="mt-5 rounded-[22px] bg-white p-10 text-center shadow-suave ring-1 ring-linea/60">
            <p className="text-lg font-extrabold text-tinta">No encontramos resultados{b.q ? ` para “${b.q}”` : ""}</p>
            <p className="mt-1 text-sm text-gris">Prueba con otra palabra o quita algún filtro.</p>
          </section>
        ) : (
          <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {r.tiendas.map((t) => (
              <article key={t.id} className="flex flex-col rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
                <div className="flex items-center gap-3">
                  {t.logo_url ? <img src={t.logo_url} alt="" className="size-11 rounded-xl object-cover" /> : <span className="grid size-11 place-items-center rounded-xl bg-crema font-display font-extrabold text-pino">{t.nombre[0]}</span>}
                  <span className="min-w-0">
                    <b className="block truncate text-tinta">{t.nombre}</b>
                    <span className="text-xs text-gris">{rubros[t.rubro] ?? t.rubro}</span>
                  </span>
                </div>
                {t.descripcion && <p className="mt-3 line-clamp-2 text-sm text-tinta/80">{t.descripcion}</p>}
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gris">
                  <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-aviso text-aviso" /> {REPUTACION[t.reputacion] ?? t.reputacion}</span>
                  {t.lugar && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {t.lugar}</span>}
                  <span>{t.ventas.toLocaleString("es-PE")} ventas</span>
                </p>
                <div className="mt-3 flex gap-2">
                  {t.productos.map((p) => (
                    <Link key={p.id} href={`/t/${t.slug}/p/${p.id}`} className="casilla-producto relative size-24 overflow-hidden rounded-xl">
                      {p.imagen_url && <img src={p.imagen_url} alt={p.nombre} className="foto-producto" />}
                      {p.descuento_pct > 0 && <span className="absolute left-1.5 top-1.5 rounded bg-coral px-1.5 text-[10px] font-bold text-white">-{p.descuento_pct}%</span>}
                      {p.destacado && <span className="absolute right-1.5 top-1.5 rounded bg-pino px-1.5 text-[10px] font-bold text-white">Destacado</span>}
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-tinta/80 px-1.5 text-[10px] font-bold text-white">{soles(p.precio_final_centimos)}</span>
                    </Link>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between pt-4">
                  <span className="flex gap-2 text-gris">{t.entregas.map((e) => <span key={e} title={e}>{ENTREGA_ICONO[e]}</span>)}</span>
                  <Link href={`/t/${t.slug}`} className="rounded-full bg-pino px-4 py-2 text-sm font-bold text-white">Ver tienda</Link>
                </div>
              </article>
            ))}
          </section>
        )}
        <PieLegal className="mt-14 border-t border-linea pt-6" />
      </main>
    </div>
  );
}
