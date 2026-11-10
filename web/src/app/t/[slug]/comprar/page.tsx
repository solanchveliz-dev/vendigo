import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { API_URL } from "@/lib/servidor/sesion";
import { estiloTema } from "@/lib/tema";
import type { Tienda } from "@/lib/tipos";
import { CabeceraPublica } from "@/components/tienda/cabecera";
import { PieLegal } from "@/components/legal/pie";
import { Checkout } from "@/components/tienda/checkout";

type Params = { params: Promise<{ slug: string }> };

async function cargar(slug: string) {
  const r = await fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}`, { cache: "no-store" });
  return r.ok ? ((await r.json()) as Tienda) : null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const t = await cargar((await params).slug).catch(() => null);
  return { title: t ? `Tu pedido · ${t.nombre}` : "Tu pedido", robots: { index: false } };
}

export default async function Comprar({ params }: Params) {
  const t = await cargar((await params).slug).catch(() => null);
  if (!t) notFound();
  return (
    <div className="min-h-screen bg-crema">
      <CabeceraPublica />
      <main className="mx-auto max-w-[1100px] px-5 pb-16 sm:px-10" style={estiloTema(t)}>
        <Checkout tienda={t} />
        <PieLegal className="mt-14 border-t border-linea pt-6" />
      </main>
    </div>
  );
}
