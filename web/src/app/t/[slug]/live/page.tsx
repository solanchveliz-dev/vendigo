"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Radio, Search, Zap } from "lucide-react";
import { useApi } from "@/lib/api";
import { guardarSeparacion } from "@/lib/carrito";
import { soles } from "@/lib/formato";
import { Cargando, Entrada } from "@/components/ui";
import { CabeceraPublica } from "@/components/tienda/cabecera";

type ProductoLive = { id: string; codigo: number; nombre: string; precio_centimos: number; stock: number; tiene_variantes: boolean; imagen_url: string };
type Live = { tienda: string; activo: boolean; minutos: number; productos: ProductoLive[] };

// Página del Modo live para la compradora que llega desde TikTok, Facebook o Instagram: busca por el código que
// dice la vendedora, ve el stock al momento y separa. El stock se actualiza solo cada pocos segundos.
export default function LivePublico({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { datos, error, recargar } = useApi<Live>(`/tiendas/${encodeURIComponent(slug)}/live`);
  const [codigo, setCodigo] = useState("");

  useEffect(() => {
    const t = setInterval(recargar, 5000);
    const alVolver = () => document.visibilityState === "visible" && recargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [recargar]);

  // Un corte de internet no borra lo que ya se ve: solo se muestra "no encontrada" si nunca cargó.
  if (error && !datos) {
    return (
      <div className="min-h-screen bg-crema">
        <CabeceraPublica />
        <p className="mx-auto max-w-[640px] px-5 py-16 text-center text-sm text-gris">No encontramos esta tienda.</p>
      </div>
    );
  }
  if (!datos) return <Cargando />;

  const lista = codigo.trim() ? datos.productos.filter((p) => String(p.codigo) === codigo.trim()) : datos.productos;

  function separar(p: ProductoLive) {
    if (p.tiene_variantes) {
      router.push(`/t/${slug}/p/${p.id}?live=1&min=${datos!.minutos}`);
      return;
    }
    guardarSeparacion(slug, [{ producto_id: p.id, variante_id: "", cantidad: 1, nombre: p.nombre, variante: "", precio_centimos: p.precio_centimos, imagen_url: p.imagen_url, stock: p.stock }]);
    router.push(`/t/${slug}/comprar?live=1&min=${datos!.minutos}`);
  }

  return (
    <div className="min-h-screen bg-crema">
      <CabeceraPublica />
      <main className="mx-auto max-w-[720px] px-5 pb-16 pt-6">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="flex items-center gap-2 text-[30px] font-extrabold leading-tight text-pino">
          {datos.activo && <Radio className="size-6 text-coral" />} {datos.tienda} {datos.activo ? "en vivo" : ""}
        </h1>

        {!datos.activo ? (
          <div className="mt-5 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
            <p className="font-bold text-tinta">El live terminó.</p>
            <p className="mt-1 text-sm text-gris">Puedes seguir comprando en la tienda.</p>
            <Link href={`/t/${slug}`} className="mt-4 inline-flex h-11 items-center rounded-full bg-pino px-6 text-sm font-bold text-white">Ver la tienda</Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-gris">
              Toca <b className="text-tinta">Separar</b> en el producto que quieres. Tendrás <b className="text-tinta">{datos.minutos} minutos</b> para pagar y subir tu captura; si no, se libera para otra persona.
            </p>
            <div className="relative mt-5">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gris" />
              <Entrada inputMode="numeric" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="Escribe el código que dice en el live" className="pl-10" />
            </div>

            <ul className="mt-5 space-y-3">
              {lista.map((p) => (
                <li key={p.id} className="flex items-center gap-4 rounded-[22px] bg-white p-3 shadow-suave ring-1 ring-linea/60">
                  <span className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-arena">
                    {p.imagen_url && <img src={p.imagen_url} alt="" className="size-full object-cover" />}
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-pino px-1.5 py-0.5 text-xs font-bold text-white">{p.codigo}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-tinta">{p.nombre}</b>
                    <span className="font-display text-lg font-extrabold text-tinta">{soles(p.precio_centimos)}</span>
                    <span className={`block text-xs ${p.stock > 0 ? "text-gris" : "font-semibold text-error"}`}>
                      {p.stock > 0 ? `${p.stock} disponible${p.stock === 1 ? "" : "s"}` : "Agotado por ahora · puede liberarse si alguien no paga"}
                    </span>
                  </span>
                  <button onClick={() => separar(p)} disabled={p.stock === 0}
                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-coral px-5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-40">
                    <Zap className="size-4" /> Separar
                  </button>
                </li>
              ))}
              {!lista.length && <li className="py-8 text-center text-sm text-gris">{codigo ? `No hay un producto con el código ${codigo}.` : "Todavía no hay productos en este live."}</li>}
            </ul>
            <p className="mt-6 text-center text-xs text-gris">Separar no es pagar: el producto es tuyo cuando la tienda confirma tu pago.</p>
          </>
        )}
      </main>
    </div>
  );
}
