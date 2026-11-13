"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Star, X } from "lucide-react";
import { api, ErrorApi } from "@/lib/api";
import { Area, Boton, useAvisar } from "@/components/ui";
import type { PedidoDetalle } from "@/lib/tipos";

// Respuestas rápidas (como en inDrive): con 4 o 5 estrellas, lo bueno para destacar; con 1 a 3, lo que falló.
// Son las mismas que valida la API (pedidos.EtiquetasBuenas / EtiquetasMalas).
const BUENAS = ["Llegó a tiempo", "Bien empacado", "Igual que en la foto", "Buena calidad", "Buena atención", "Buen precio"];
const MALAS = ["Llegó tarde", "Mal empacado", "Distinto a la foto", "Llegó dañado", "Mala atención", "Faltó algo"];

// Calificar el pedido desde el enlace de seguimiento, apenas el cliente lo recibe.
// Las estrellas de la tienda son obligatorias; las de cada producto, el comentario y las fotos de cómo llegó son opcionales.
// Las fotos van al bucket privado con una URL firmada para este pedido.
export function CalificarPedido({ token, pedido, tienda, enfocar, listo }: { token: string; pedido: PedidoDetalle; tienda: string; enfocar: boolean; listo: () => void }) {
  const avisar = useAvisar();
  const caja = useRef<HTMLElement>(null);
  const [estrellas, setEstrellas] = useState(0);
  const [productos, setProductos] = useState<Record<string, number>>({});
  const [comentario, setComentario] = useState("");
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [fotos, setFotos] = useState<FotoSubida[]>([]);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");

  // Recién confirmó que lo recibió: se lleva la vista a la calificación.
  useEffect(() => {
    if (enfocar) caja.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [enfocar]);

  const unicos = pedido.items_detalle.filter((it, i, arr) => it.producto_id && arr.findIndex((x) => x.producto_id === it.producto_id) === i);

  async function enviar() {
    if (!estrellas) return setError(`Elige cuántas estrellas le das a ${tienda}.`);
    setError("");
    setOcupado("enviar");
    try {
      await api.post(`/seguimiento/${token}/valorar`, { tienda: estrellas, productos, comentario, etiquetas, fotos: fotos.map((f) => f.key) });
      avisar("¡Gracias por calificar! Tu opinión ayuda a la tienda y a otros compradores.");
      listo();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado("");
    }
  }

  return (
    <section ref={caja} className="rounded-[22px] bg-white p-5 shadow-suave ring-2 ring-coral/60">
      <h2 className="text-lg font-extrabold text-tinta">¿Cómo te fue con tu compra?</h2>
      <p className="mt-1 text-sm text-gris">Tu calificación ayuda a {tienda} a mejorar y a otros compradores a decidir.</p>

      <p className="mt-4 text-sm font-bold text-tinta">Califica a {tienda}</p>
      <Estrellas
        valor={estrellas}
        cambiar={(n) => {
          // Al pasar de buena a mala (o al revés) cambian las respuestas: se quitan las que ya no aplican.
          if ((n >= 4) !== (estrellas >= 4)) setEtiquetas([]);
          setEstrellas(n);
          setError("");
        }}
        grande
        etiqueta={`Estrellas para ${tienda}`}
      />
      {error && <p className="mt-1 text-sm text-error">{error}</p>}

      <RespuestasRapidas estrellas={estrellas} valor={etiquetas} cambiar={setEtiquetas} />

      {unicos.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-bold text-tinta">Califica lo que compraste <span className="font-normal text-gris">(opcional)</span></p>
          {unicos.map((it) => (
            <div key={it.producto_id} className="flex items-center gap-3 rounded-2xl bg-crema/60 p-2.5">
              {it.imagen_url ? <img src={it.imagen_url} alt="" className="size-11 rounded-xl bg-white object-contain p-1" /> : <span className="size-11 rounded-xl bg-arena" />}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-tinta">{it.nombre}{it.variante ? ` · ${it.variante}` : ""}</span>
              <Estrellas valor={productos[it.producto_id] ?? 0} cambiar={(n) => setProductos((x) => ({ ...x, [it.producto_id]: n }))} etiqueta={`Estrellas para ${it.nombre}`} />
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-sm font-bold text-tinta">Cuéntanos más <span className="font-normal text-gris">(opcional)</span></p>
      <Area value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} rows={3} placeholder="Ej. Llegó bien empacado y a tiempo." className="mt-1.5" />

      <FotosLlegada
        valor={fotos}
        cambiar={setFotos}
        pedirSubida={(f) => api.post<{ key: string; url_subida: string }>(`/seguimiento/${token}/archivo`, { tipo: "valoracion", content_type: f.type || "image/jpeg", tamano: f.size })}
      />

      <Boton className="mt-5 w-full" cargando={ocupado === "enviar"} onClick={enviar}>Enviar calificación</Boton>
    </section>
  );
}

// Respuestas rápidas según las estrellas. Al pasar de buena a mala (o al revés) quien llama limpia la selección.
export function RespuestasRapidas({ estrellas, valor, cambiar }: { estrellas: number; valor: string[]; cambiar: (v: string[]) => void }) {
  if (!estrellas) return null;
  const buena = estrellas >= 4;
  return (
    <div className="mt-4">
      <p className="text-sm font-bold text-tinta">{buena ? "¿Qué te gustó?" : "¿Qué pasó?"} <span className="font-normal text-gris">(toca las que apliquen)</span></p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(buena ? BUENAS : MALAS).map((o) => {
          const activa = valor.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={activa}
              onClick={() => cambiar(activa ? valor.filter((y) => y !== o) : [...valor, o])}
              className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${activa ? (buena ? "bg-pino text-white" : "bg-error text-white") : "bg-white text-tinta ring-1 ring-linea hover:ring-pino/50"}`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type FotoSubida = { key: string; vista: string };

// Fotos de cómo llegó el pedido (opcional, hasta 3). Cada una se sube al bucket privado con una URL firmada
// que entrega la API (desde el seguimiento o desde "Mi cuenta"): pedirSubida dice a dónde pedirla.
export function FotosLlegada({ valor, cambiar, pedirSubida }: { valor: FotoSubida[]; cambiar: (v: FotoSubida[]) => void; pedirSubida: (f: File) => Promise<{ key: string; url_subida: string }> }) {
  const avisar = useAvisar();
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function agregar(lista: FileList | null) {
    if (!lista?.length) return;
    setSubiendo(true);
    try {
      const nuevas: FotoSubida[] = [];
      for (const f of Array.from(lista).slice(0, 3 - valor.length)) {
        if (f.size > 8 * 1024 * 1024) throw new Error("Cada foto puede pesar hasta 8 MB.");
        const s = await pedirSubida(f);
        const r = await fetch(s.url_subida, { method: "PUT", headers: { "Content-Type": f.type || "image/jpeg" }, body: f });
        if (!r.ok) throw new Error("No se pudo subir la foto. Inténtalo de nuevo.");
        nuevas.push({ key: s.key, vista: URL.createObjectURL(f) });
      }
      cambiar([...valor, ...nuevas]);
    } catch (e) {
      avisar((e as ErrorApi).message || (e as Error).message, "error");
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div>
      <p className="mt-4 text-sm font-bold text-tinta">Fotos de cómo te llegó <span className="font-normal text-gris">(opcional, hasta 3)</span></p>
      <div className="mt-2 flex flex-wrap gap-2">
        {valor.map((f) => (
          <span key={f.key} className="relative">
            <img src={f.vista} alt="Foto de cómo llegó el pedido" className="size-20 rounded-xl object-cover ring-1 ring-linea" />
            <button type="button" onClick={() => cambiar(valor.filter((y) => y.key !== f.key))} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-tinta text-white" aria-label="Quitar foto">
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        {valor.length < 3 && (
          <button type="button" onClick={() => entrada.current?.click()} disabled={subiendo} className="grid size-20 place-items-center rounded-xl border-2 border-dashed border-linea text-gris hover:border-pino hover:text-pino" aria-label="Agregar foto">
            {subiendo ? <span className="text-xs">Subiendo…</span> : <ImagePlus className="size-6" />}
          </button>
        )}
        <input ref={entrada} type="file" accept="image/*" multiple hidden onChange={(e) => agregar(e.target.files)} />
      </div>
    </div>
  );
}

// Estrellas que se tocan (también con teclado: cada estrella es un botón).
export function Estrellas({ valor, cambiar, grande = false, etiqueta }: { valor: number; cambiar?: (n: number) => void; grande?: boolean; etiqueta: string }) {
  return (
    <span className="flex gap-1" role={cambiar ? "radiogroup" : "img"} aria-label={cambiar ? etiqueta : `${valor} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const icono = <Star className={`${grande ? "size-8" : "size-5"} ${n <= valor ? "fill-aviso text-aviso" : "text-linea"}`} />;
        return cambiar ? (
          <button key={n} type="button" role="radio" aria-checked={n === valor} aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`} onClick={() => cambiar(n)} className="rounded-md p-0.5 transition hover:scale-110">
            {icono}
          </button>
        ) : (
          <span key={n}>{icono}</span>
        );
      })}
    </span>
  );
}

// La calificación ya enviada, para mostrarla en el pedido (al cliente y a la tienda).
export function CalificacionHecha({ v, titulo }: { v: NonNullable<PedidoDetalle["valoracion"]>; titulo: string }) {
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
      <h2 className="mb-2 text-lg font-extrabold text-tinta">{titulo}</h2>
      <Estrellas valor={v.estrellas} etiqueta="Calificación" />
      {(v.etiquetas ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {v.etiquetas.map((e) => <span key={e} className="rounded-full bg-arena px-2.5 py-1 text-xs font-semibold text-tinta">{e}</span>)}
        </div>
      )}
      {v.comentario && <p className="mt-2 text-sm leading-relaxed text-tinta/85">“{v.comentario}”</p>}
      {v.foto_urls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {v.foto_urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt="Foto de cómo llegó el pedido" className="size-24 rounded-xl object-cover ring-1 ring-linea" /></a>
          ))}
        </div>
      )}
    </section>
  );
}
