import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { API_URL, cabeceraSesion } from "@/lib/servidor/sesion";
import type { Tienda } from "@/lib/tipos";
import { CabeceraPublica } from "@/components/tienda/cabecera";
import { PieLegal } from "@/components/legal/pie";
import { Checkout } from "@/components/tienda/checkout";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ vista?: string; live?: string; min?: string }> };

async function cargar(slug: string) {
  const r = await fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}`, { cache: "no-store", headers: await cabeceraSesion() });
  return r.ok ? ((await r.json()) as Tienda) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await cargar((await params).slug).catch(() => null);
  return { title: t ? `Tu pedido · ${t.nombre}` : "Tu pedido", robots: { index: false } };
}

export default async function Comprar({ params, searchParams }: Params) {
  const t = await cargar((await params).slug).catch(() => null);
  const sp = await searchParams;
  const vista = sp.vista === "1";
  const live = sp.live === "1";
  const minutosLive = Math.min(15, Math.max(0, Number(sp.min) || 0));
  if (!t) notFound();
  return (
    <div className="min-h-screen bg-crema">
      {!vista && <CabeceraPublica />}
      <main className="mx-auto max-w-[1200px] px-5 pb-16 sm:px-10">
        <Checkout tienda={t} vista={vista} live={live} minutosLive={minutosLive} />
        <PieLegal className="mt-14 border-t border-linea pt-6" />
      </main>
    </div>
  );
}
