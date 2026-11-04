import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, ShieldCheck } from "lucide-react";
import { API_URL } from "@/lib/servidor/sesion";
import { soles } from "@/lib/formato";
import { rubros } from "@/lib/catalogos";
import type { Producto, Tienda } from "@/lib/tipos";

// Página pública de la tienda. Se genera en el servidor para que Google pueda leerla.
async function cargar(slug: string) {
  const [t, p] = await Promise.all([
    fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } }),
    fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}/productos`, { next: { revalidate: 60 } }),
  ]);
  if (!t.ok) return null;
  return { tienda: (await t.json()) as Tienda, productos: ((await p.json()) as { productos: Producto[] }).productos };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await cargar((await params).slug).catch(() => null);
  if (!d) return { title: "Tienda no encontrada" };
  return {
    title: d.tienda.nombre,
    description: d.tienda.descripcion || `${rubros[d.tienda.rubro]} en ${d.tienda.ciudad}. Compra con pago protegido en VendiGo.`,
    openGraph: { images: d.tienda.logo_url ? [d.tienda.logo_url] : [] },
  };
}

export default async function TiendaPublica({ params }: { params: Promise<{ slug: string }> }) {
  const d = await cargar((await params).slug).catch(() => null);
  if (!d) notFound();
  const { tienda: t, productos } = d;

  return (
    <div className="min-h-screen">
      <header className="flex h-16 items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={32} height={32} />
          <span className="font-display text-lg font-extrabold text-pino">VendiGo</span>
        </Link>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-ok">
          <ShieldCheck className="size-4" /> Pago protegido
        </span>
      </header>
      <div className="mx-auto max-w-5xl px-5 pb-16">
        <div className="h-44 rounded-2xl bg-pino bg-cover bg-center" style={t.portada_url ? { backgroundImage: `url(${t.portada_url})` } : undefined} />
        <div className="-mt-12 flex flex-col items-center text-center">
          <div className="size-24 overflow-hidden rounded-full bg-crema ring-4 ring-crema">
            {t.logo_url ? <img src={t.logo_url} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center bg-white font-display text-3xl font-extrabold text-pino">{t.nombre[0]}</span>}
          </div>
          <h1 className="mt-3 text-3xl font-extrabold text-pino">{t.nombre}</h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-gris">
            {rubros[t.rubro]} · <MapPin className="inline size-3" /> {t.distrito || t.ciudad}
          </p>
          {t.descripcion && <p className="mt-2 max-w-xl text-gris">{t.descripcion}</p>}
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {productos.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-xl bg-white shadow-suave ring-1 ring-linea/60">
              <div className="relative aspect-square bg-arena">
                {p.imagenes[0] && <img src={p.imagenes[0].url} alt={p.nombre} className="size-full object-cover" />}
                {p.oferta && <span className="absolute left-2 top-2 rounded-full bg-coral px-2 py-0.5 text-xs font-bold text-white">-{p.oferta.descuento_pct}%</span>}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-semibold">{p.nombre}</p>
                <p className="mt-1 font-display font-extrabold text-pino">
                  {soles(p.oferta?.precio_final_centimos ?? p.precio_centimos)}
                  {p.oferta && <span className="ml-1 text-xs font-normal text-gris line-through">{soles(p.precio_centimos)}</span>}
                </p>
                {p.stock === 0 && <p className="text-xs font-semibold text-error">Agotado</p>}
              </div>
            </div>
          ))}
        </div>
        {!productos.length && <p className="mt-10 text-center text-gris">Esta tienda aún no publica productos.</p>}
      </div>
    </div>
  );
}
