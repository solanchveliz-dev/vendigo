"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { ShoppingBag, Star, Store } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Area, Aviso, Boton, Cargando, cn, useAvisar } from "@/components/ui";
import { Titulo } from "@/components/admin/ui";
import { Vacio } from "@/components/comprador/ui";

type Datos = { codigo: string; tienda: string; tienda_logo: string; productos: { producto_id: string; nombre: string; variante: string; imagen_url: string }[] };

function Estrellas({ valor, cambiar, nombre }: { valor: number; cambiar: (n: number) => void; nombre: string }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={`Estrellas para ${nombre}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => cambiar(n)} className="grid size-11 place-items-center rounded-full transition hover:bg-aviso-claro" aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`} aria-checked={valor === n} role="radio">
          <Star className={cn("size-6", n <= valor ? "fill-aviso text-aviso" : "text-linea")} />
        </button>
      ))}
    </div>
  );
}

// Valorar pedido (prototipo n.° 26): estrellas por producto y para la tienda, y un comentario opcional.
export default function Valorar({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = use(params);
  const router = useRouter();
  const avisar = useAvisar();
  const { datos, error } = useApi<Datos>(`/comprador/pedidos/${encodeURIComponent(codigo)}/valorar`);
  const [tienda, setTienda] = useState(0);
  const [prods, setProds] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState("");
  const [falta, setFalta] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (error)
    return (
      <Vacio titulo="No puedes valorar este pedido" texto={error.message}>
        <Link href="/mi-cuenta/pedidos" className="inline-flex h-11 items-center rounded-full bg-pino px-6 text-sm font-bold text-white">Ir a Mis pedidos</Link>
      </Vacio>
    );
  if (!datos) return <Cargando />;

  async function publicar() {
    setFalta("");
    if (!tienda || datos!.productos.some((p) => !prods[p.producto_id])) return setFalta("Elige las estrellas de cada producto y de la tienda para publicar.");
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/comprador/pedidos/${encodeURIComponent(codigo)}/valorar`, { tienda, productos: prods, comentario });
      avisar(r.mensaje);
      router.replace("/mi-cuenta/pedidos");
    } catch (err) {
      setFalta((err as ErrorApi).message);
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <Titulo titulo="¿Qué tal tu compra?" detalle={`Pedido ${datos.codigo} · ${datos.tienda}`} migas={<><Link href="/mi-cuenta/pedidos" className="hover:text-tinta">Mis pedidos</Link> / Valorar</>} />
      {datos.productos.map((p) => (
        <div key={p.producto_id} className="flex flex-wrap items-center gap-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
          {p.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <span className="casilla-producto block size-16 shrink-0 overflow-hidden rounded-xl"><img src={p.imagen_url} alt="" className="foto-producto" /></span>
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-crema text-gris"><ShoppingBag className="size-6" /></span>
          )}
          <div className="min-w-0 flex-1">
            <b className="block text-tinta">{p.nombre}</b>
            <span className="text-sm text-gris">{p.variante ? `${p.variante} · ` : ""}Valora el producto</span>
          </div>
          <Estrellas nombre={p.nombre} valor={prods[p.producto_id] ?? 0} cambiar={(n) => setProds({ ...prods, [p.producto_id]: n })} />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
        {datos.tienda_logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={datos.tienda_logo} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-pino-claro text-pino"><Store className="size-6" /></span>
        )}
        <div className="min-w-0 flex-1">
          <b className="block text-tinta">{datos.tienda}</b>
          <span className="text-sm text-gris">Atención, empaque y cumplimiento de la entrega</span>
        </div>
        <Estrellas nombre={datos.tienda} valor={tienda} cambiar={setTienda} />
      </div>
      <div className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
        <label className="mb-1.5 block text-sm font-semibold text-tinta">Comentario (opcional)</label>
        <Area value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} placeholder="Cuéntale a otros compradores cómo te fue" />
        <p className="mt-1 text-xs text-gris">Evita compartir datos personales.</p>
      </div>
      {falta && <Aviso tono="error">{falta}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Boton variante="acento" tamano="lg" onClick={publicar} cargando={enviando}>Publicar valoración</Boton>
        <Link href="/mi-cuenta/pedidos"><Boton variante="secundario" tamano="lg">Ahora no</Boton></Link>
      </div>
    </div>
  );
}
