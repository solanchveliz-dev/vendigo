"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { agregarAlCarrito, guardarSeparacion } from "@/lib/carrito";
import { Heart, Minus, Plus, ShoppingBag, TrendingUp, Zap } from "lucide-react";
import { soles } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";

// Galería de fotos del producto (miniaturas a la izquierda y foto grande).
export function GaleriaProducto({ producto: p }: { producto: Producto }) {
  const [foto, setFoto] = useState(0);

  return (
    // Como en el prototipo: en computadora la foto se queda fija mientras bajas por la información.
    <div className="flex min-w-0 flex-col-reverse gap-3 self-start sm:flex-row lg:sticky lg:top-24">
      {p.imagenes.length > 1 && (
        <div className="flex gap-3 overflow-x-auto sm:max-h-[calc(100vh-8rem)] sm:flex-col sm:overflow-y-auto sm:overflow-x-visible">
          {p.imagenes.map((img, i) => (
            <button
              key={img.key}
              onClick={() => setFoto(i)}
              className={`relative size-[84px] shrink-0 overflow-hidden rounded-2xl bg-white ring-2 transition ${i === foto ? "ring-pino" : "ring-transparent"}`}
            >
              <img src={img.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="relative aspect-square min-w-0 flex-1 overflow-hidden rounded-[26px] bg-white shadow-suave">
        {p.imagenes[foto] && <img src={p.imagenes[foto].url} alt={p.nombre} className="size-full object-cover" />}
        {p.oferta && <span className="absolute left-2 top-2 rounded-md bg-coral px-2 py-0.5 text-xs font-bold text-white">-{p.oferta.descuento_pct}%</span>}
        {p.vendidos > 0 && (
          <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-tinta">
            <TrendingUp className="size-4" /> {p.vendidos} vendidos
          </span>
        )}
      </div>
    </div>
  );
}

// Precio, opciones, cantidad y botones de compra.
export function CompraProducto({ producto: p, slug, pausada = false, vista = false, live = false, minutosLive = 0 }: {
  producto: Producto; slug: string; pausada?: boolean; vista?: boolean; live?: boolean; minutosLive?: number;
}) {
  const router = useRouter();
  const [agregado, setAgregado] = useState(false);
  const [opcion, setOpcion] = useState(() => Math.max(0, p.variantes.findIndex((v) => v.stock > 0)));
  const [cantidad, setCantidad] = useState(1);
  const [aviso, setAviso] = useState("");

  const variante = p.variantes[opcion];
  const base = variante?.precio_centimos ?? p.precio_centimos;
  const precio = p.oferta ? Math.round(base * (1 - p.oferta.descuento_pct / 100)) : base;
  const stock = variante ? variante.stock : p.stock;
  const det = (p.detalles ?? {}) as { colores?: [string, string][]; grupos?: { label: string }[] };
  const etiquetaOpciones = det.grupos?.[0]?.label ?? (p.variantes.length && det.colores?.length && !det.grupos?.length ? "Color" : "Opciones");
  const dias = p.oferta ? Math.max(0, Math.ceil((new Date(p.oferta.termina_en).getTime() - Date.now()) / 86400000)) : 0;

  // Modo live: la separación va aparte del carrito normal y lleva directo a confirmar.
  function separar() {
    guardarSeparacion(slug, [{
      producto_id: p.id, variante_id: variante?.id ?? "", cantidad, nombre: p.nombre, variante: variante?.nombre ?? "",
      precio_centimos: precio, imagen_url: p.imagenes[0]?.url ?? "", stock,
    }]);
    router.push(`/t/${slug}/comprar?live=1${minutosLive ? `&min=${minutosLive}` : ""}`);
  }

  function agregar() {
    agregarAlCarrito(slug, {
      producto_id: p.id,
      variante_id: variante?.id ?? "",
      cantidad,
      nombre: p.nombre,
      variante: variante?.nombre ?? "",
      precio_centimos: precio,
      imagen_url: p.imagenes[0]?.url ?? "",
      stock,
    });
  }

  function pronto(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(""), 2600);
  }

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="font-display text-[44px] font-extrabold leading-none text-tinta">{soles(precio)}</span>
        {p.oferta && <span className="text-lg text-gris line-through">{soles(base)}</span>}
        {p.oferta && (
          <span className="inline-flex items-center gap-1 rounded-full bg-coral-claro px-3 py-1 text-sm font-semibold text-coral">
            <Zap className="size-3.5" /> -{p.oferta.descuento_pct}% · {dias <= 1 ? "termina hoy" : `termina en ${dias} días`}
          </span>
        )}
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${stock === 0 ? "bg-error-claro text-error" : stock <= 3 ? "bg-aviso-claro text-aviso" : "bg-pino-claro text-pino"}`}>
          {stock === 0 ? "Agotado" : stock <= 3 ? `Quedan ${stock}` : "Disponible"}
        </span>
      </div>

      {p.variantes.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-tinta">{etiquetaOpciones}</p>
          <div className="flex flex-wrap gap-2.5">
            {p.variantes.map((v, i) => (
              <button
                key={v.id ?? v.nombre}
                onClick={() => {
                  setOpcion(i);
                  setCantidad(1);
                }}
                disabled={v.stock === 0}
                className={`rounded-xl px-4 py-2.5 text-[15px] font-semibold transition disabled:opacity-40 ${i === opcion ? "bg-pino-claro text-pino ring-2 ring-pino/40" : "bg-white text-tinta ring-1 ring-linea"}`}
              >
                {v.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {det.colores && det.colores.length > 0 && etiquetaOpciones !== "Color" && (
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold text-tinta">Colores</p>
          <div className="flex flex-wrap gap-2">
            {det.colores.map(([n, hx]) => (
              <span key={n} className="inline-flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3 text-sm font-semibold ring-1 ring-linea">
                <i className="size-5 rounded-full ring-1 ring-black/10" style={{ background: hx }} /> {n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="mb-2 text-sm font-semibold text-tinta">Cantidad</p>
        <div className="flex h-11 items-center rounded-full bg-white px-2 ring-1 ring-linea">
          <button onClick={() => setCantidad((c) => Math.max(1, c - 1))} className="grid size-9 place-items-center rounded-full text-tinta hover:bg-arena" aria-label="Menos">
            <Minus className="size-4" />
          </button>
          <span className="w-10 text-center font-semibold">{cantidad}</span>
          <button onClick={() => setCantidad((c) => Math.min(Math.max(1, stock), c + 1))} className="grid size-9 place-items-center rounded-full text-tinta hover:bg-arena" aria-label="Más">
            <Plus className="size-4" />
          </button>
        </div>
      </div>

      {pausada && (
        <p className="mt-5 rounded-2xl bg-arena px-4 py-3 text-sm font-semibold text-tinta">Esta tienda está en pausa y no recibe pedidos por ahora.</p>
      )}
      {live && !vista ? (
        <div className="mt-5">
          <button onClick={separar} disabled={stock === 0 || pausada}
            className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-coral px-4 font-bold text-white transition hover:opacity-90 disabled:opacity-50">
            <Zap className="size-5 shrink-0" /> {stock === 0 ? "Agotado por ahora" : "Separar"}
          </button>
          <p className="mt-2 text-center text-xs text-gris">
            {minutosLive ? `Tendrás ${minutosLive} minutos para pagar.` : "Tendrás unos minutos para pagar."} Si no pagas a tiempo, se libera para otra persona.
          </p>
        </div>
      ) : (
      <div className="mt-5 flex gap-3">
        <button
          onClick={() => {
            if (vista) return pronto("Vista previa: así ven el botón tus clientes. Aquí no se puede comprar.");
            agregar();
            router.push(`/t/${slug}/comprar`);
          }}
          disabled={stock === 0 || pausada}
          className="inline-flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-pino px-4 font-bold text-white transition hover:bg-pino-2 disabled:opacity-50"
        >
          <Zap className="size-5 shrink-0" /> Comprar ahora
        </button>
        <button
          onClick={() => {
            if (vista) return pronto("Vista previa: así ven el botón tus clientes. Aquí no se puede comprar.");
            agregar();
            setAgregado(true);
          }}
          disabled={stock === 0 || pausada}
          aria-label="Agregar a mi pedido"
          className="inline-flex h-[52px] min-w-[52px] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-coral px-4 font-bold sm:px-7 text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <ShoppingBag className="size-5 shrink-0" /> <span className="hidden sm:inline">Agregar</span>
        </button>
        <button
          onClick={() => pronto(vista ? "Vista previa: aquí no se puede comprar." : "Pronto podrás guardar favoritos con tu cuenta.")}
          className="grid size-[52px] shrink-0 place-items-center rounded-full bg-white text-tinta ring-1 ring-linea transition hover:text-coral"
          aria-label="Guardar en favoritos"
        >
          <Heart className="size-5" />
        </button>
      </div>
      )}
      {aviso && <p className="mt-2 text-center text-sm font-semibold text-gris">{aviso}</p>}
      {agregado && (
        <p className="mt-3 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-pino-claro px-4 py-2.5 text-sm font-semibold text-pino">
          Agregado a tu pedido.
          <Link href={`/t/${slug}/comprar`} className="underline underline-offset-2">Ver mi pedido</Link>
        </p>
      )}
    </>
  );
}
