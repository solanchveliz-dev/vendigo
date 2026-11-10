import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { API_URL } from "@/lib/servidor/sesion";
import type { Tienda } from "@/lib/tipos";
import { CabeceraPublica } from "@/components/tienda/cabecera";
import { PieLegal } from "@/components/legal/pie";
import { Checkout } from "@/components/tienda/checkout";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ vista?: string }> };

async function cargar(slug: string) {
  const r = await fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}`, { cache: "no-store" });
  return r.ok ? ((await r.json()) as Tienda) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await cargar((await params).slug).catch(() => null);
  return { title: t ? `Tu pedido · ${t.nombre}` : "Tu pedido", robots: { index: false } };
}

export default async function Comprar({ params, searchParams }: Params) {
  const t = await cargar((await params).slug).catch(() => null);
  const vista = (await searchParams).vista === "1";
  if (!t) notFound();
  return (
    <div className="min-h-screen bg-crema">
      {!vista && <CabeceraPublica />}
      <main className="mx-auto max-w-[1200px] px-5 pb-16 sm:px-10">
        <Checkout tienda={t} vista={vista} />
        <PieLegal className="mt-14 border-t border-linea pt-6" />
      </main>
    </div>
  );
}
