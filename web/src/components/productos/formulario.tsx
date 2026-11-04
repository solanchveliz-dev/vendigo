"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, GripVertical, Plus, Sparkles, Trash2, X } from "lucide-react";
import { api, ErrorApi } from "@/lib/api";
import { aCentimos } from "@/lib/formato";
import { subirImagen } from "@/lib/subir";
import type { Producto, Variante } from "@/lib/tipos";
import { Aviso, Boton, Campo, Entrada, Area, Interruptor, Tarjeta, useAvisar } from "@/components/ui";

type Foto = { key: string; url: string };

export function FormularioProducto({ producto }: { producto?: Producto }) {
  const router = useRouter();
  const avisar = useAvisar();
  const [fotos, setFotos] = useState<Foto[]>(producto?.imagenes ?? []);
  const [f, setF] = useState({
    nombre: producto?.nombre ?? "",
    descripcion: producto?.descripcion ?? "",
    categoria: producto?.categoria ?? "",
    precio: producto ? (producto.precio_centimos / 100).toFixed(2) : "",
    stock: String(producto?.stock ?? 1),
  });
  const [conVariantes, setConVariantes] = useState((producto?.variantes.length ?? 0) > 0);
  const [variantes, setVariantes] = useState<Variante[]>(producto?.variantes.length ? producto.variantes : [{ nombre: "", stock: 1, precio_centimos: null }]);
  const [activo, setActivo] = useState(producto?.activo ?? true);
  const [subiendo, setSubiendo] = useState(false);
  const [ia, setIa] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function agregarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []).slice(0, 6 - fotos.length);
    e.target.value = "";
    setSubiendo(true);
    try {
      const nuevas: Foto[] = [];
      for (const a of archivos) nuevas.push(await subirImagen(a, "producto"));
      setFotos((x) => [...x, ...nuevas]);
    } catch (err) {
      avisar((err as Error).message, "error");
    } finally {
      setSubiendo(false);
    }
  }

  async function completarConIA() {
    if (!fotos[0]) return;
    setIa(true);
    try {
      const r = await api.post<{ sugerencia: { nombre: string; descripcion: string; categoria: string; caracteristicas: string[] } }>("/vendedor/ia/publicar-con-foto", { imagen_key: fotos[0].key });
      const s = r.sugerencia;
      const extra = s.caracteristicas?.length ? "\n\n" + s.caracteristicas.map((c) => `• ${c}`).join("\n") : "";
      setF({ ...f, nombre: s.nombre, descripcion: s.descripcion + extra, categoria: s.categoria });
      avisar("La IA completó los datos. Revísalos antes de publicar.");
    } catch (err) {
      avisar((err as ErrorApi).message, "error");
    } finally {
      setIa(false);
    }
  }

  function mover(i: number) {
    if (i === 0) return;
    const x = [...fotos];
    [x[0], x[i]] = [x[i], x[0]];
    setFotos(x);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    const cuerpo = {
      nombre: f.nombre,
      descripcion: f.descripcion,
      categoria: f.categoria,
      precio_centimos: aCentimos(f.precio),
      stock: conVariantes ? 0 : Number(f.stock) || 0,
      activo,
      variantes: conVariantes ? variantes.filter((v) => v.nombre.trim()) : [],
      imagenes: fotos.map((x) => x.key),
    };
    try {
      if (producto) {
        await api.put(`/vendedor/productos/${producto.id}`, cuerpo);
        avisar("Cambios guardados.");
        router.refresh();
      } else {
        const p = await api.post<Producto>("/vendedor/productos", cuerpo);
        avisar("¡Producto publicado!");
        router.replace(`/vendedor/productos/${p.id}`);
      }
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Tarjeta>
        <h2 className="mb-1 font-extrabold text-pino">Fotos</h2>
        <p className="mb-4 text-sm text-gris">Hasta 6. La primera es la portada.</p>
        <div className="grid grid-cols-3 gap-3">
          {fotos.map((x, i) => (
            <div key={x.key} className="group relative aspect-square overflow-hidden rounded-xl bg-arena">
              <img src={x.url} alt="" className="size-full object-cover" />
              {i === 0 && <span className="absolute bottom-1 left-1 rounded-full bg-pino px-2 text-[11px] font-semibold text-white">Portada</span>}
              <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                {i > 0 && (
                  <button type="button" onClick={() => mover(i)} className="grid size-7 place-items-center rounded-full bg-white/90" title="Usar como portada">
                    <GripVertical className="size-3.5" />
                  </button>
                )}
                <button type="button" onClick={() => setFotos(fotos.filter((_, j) => j !== i))} className="grid size-7 place-items-center rounded-full bg-white/90" title="Quitar">
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
          {fotos.length < 6 && (
            <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed border-linea bg-white text-center text-pino">
              <span className="flex flex-col items-center gap-1 text-xs font-semibold">
                <Camera className="size-6" />
                {subiendo ? "Subiendo…" : "Agregar"}
              </span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={agregarFotos} disabled={subiendo} />
            </label>
          )}
        </div>
        {fotos.length > 0 && (
          <div className="mt-4 rounded-xl bg-pino-claro p-4">
            <p className="text-sm font-semibold text-pino">¿Te ayudamos a escribirlo?</p>
            <p className="mb-3 text-sm text-pino/80">La IA mira la foto de portada y propone el nombre, la descripción y la categoría.</p>
            <Boton type="button" variante="primario" tamano="sm" cargando={ia} onClick={completarConIA}>
              <Sparkles className="size-4" /> Completar con IA · 3 créditos
            </Boton>
          </div>
        )}
      </Tarjeta>

      <div className="space-y-5">
        {error && <Aviso tono="error">{error}</Aviso>}
        <Tarjeta className="space-y-4">
          <Campo etiqueta="Nombre del producto">
            <Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={80} required />
          </Campo>
          <Campo etiqueta="Descripción" ayuda="Material, medidas, cuidados: lo que te preguntan siempre.">
            <Area value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} rows={5} maxLength={2000} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Precio (S/)">
              <Entrada value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} inputMode="decimal" placeholder="45.00" required />
            </Campo>
            <Campo etiqueta="Categoría (opcional)">
              <Entrada value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} placeholder="Aretes" />
            </Campo>
          </div>
        </Tarjeta>

        <Tarjeta className="space-y-3">
          <Interruptor activo={conVariantes} onChange={setConVariantes} etiqueta="Tiene tallas, colores o sabores" detalle="Cada opción con su propio stock." />
          {conVariantes ? (
            <div className="space-y-2">
              {variantes.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <Entrada value={v.nombre} onChange={(e) => setVariantes(variantes.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Talla M" />
                  <Entrada value={String(v.stock)} onChange={(e) => setVariantes(variantes.map((x, j) => (j === i ? { ...x, stock: Number(e.target.value) || 0 } : x)))} inputMode="numeric" className="w-24" />
                  <button type="button" onClick={() => setVariantes(variantes.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center rounded-xl text-gris hover:bg-arena" aria-label="Quitar">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Boton type="button" variante="fantasma" tamano="sm" onClick={() => setVariantes([...variantes, { nombre: "", stock: 1, precio_centimos: null }])}>
                <Plus className="size-4" /> Agregar opción
              </Boton>
            </div>
          ) : (
            <Campo etiqueta="Stock">
              <Entrada value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} inputMode="numeric" className="w-32" />
            </Campo>
          )}
        </Tarjeta>

        <Tarjeta>
          <Interruptor activo={activo} onChange={setActivo} etiqueta="Publicado en mi tienda" detalle={activo ? "Los clientes pueden verlo y comprarlo." : "Está pausado: no aparece en tu tienda."} />
        </Tarjeta>

        <Boton bloque tamano="lg" variante="acento" cargando={guardando} disabled={!fotos.length}>
          {producto ? "Guardar cambios" : "Publicar producto"}
        </Boton>
        {!fotos.length && <p className="text-center text-sm text-gris">Agrega al menos una foto para publicar.</p>}
      </div>
    </form>
  );
}
