"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera, Check, ShoppingBag, X } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { FUENTES, TEMAS, estiloTema } from "@/lib/tema";
import type { Producto, Tienda } from "@/lib/tipos";
import { subirImagen } from "@/lib/subir";
import { Area, Boton, Campo, Cargando, Encabezado, Entrada, Selector, Tarjeta, cn, useAvisar } from "@/components/ui";

// Personaliza cómo se ve tu tienda: color, letra de los títulos y el código de tus pedidos.
export default function EstiloTienda() {
  const avisar = useAvisar();
  const { datos: t, recargar } = useApi<Tienda>("/vendedor/tienda");
  const productos = useApi<{ productos: Producto[] }>("/vendedor/productos?filtro=activos");
  const desdeTienda = (x: Tienda) => ({
    tema_color: x.tema_color, tema_fuente: x.tema_fuente, prefijo_pedido: x.prefijo_pedido,
    destacado_id: x.destacado_id ?? "", aviso: x.aviso, historia: x.historia,
    historia_foto_key: x.historia_foto_key ?? "", historia_foto_url: x.historia_foto_url, vende_desde: x.vende_desde ? String(x.vende_desde) : "",
  });
  const [f, setF] = useState({ tema_color: "clasico", tema_fuente: "moderna", prefijo_pedido: "", destacado_id: "", aviso: "", historia: "", historia_foto_key: "", historia_foto_url: "", vende_desde: "" });
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  useEffect(() => {
    if (t) setF(desdeTienda(t));
  }, [t]);
  if (!t) return <Cargando />;

  const prefijo = f.prefijo_pedido.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  const cambiado = JSON.stringify({ ...f, prefijo_pedido: prefijo }) !== JSON.stringify(desdeTienda(t));

  async function subirFoto(archivo?: File) {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const r = await subirImagen(archivo, "historia");
      setF((x) => ({ ...x, historia_foto_key: r.key, historia_foto_url: r.url }));
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setSubiendo(false);
    }
  }

  async function guardar() {
    setGuardando(true);
    try {
      await api.put("/vendedor/tienda/estilo", {
        tema_color: f.tema_color, tema_fuente: f.tema_fuente, prefijo_pedido: prefijo,
        destacado_id: f.destacado_id || null, aviso: f.aviso, historia: f.historia,
        historia_foto_key: f.historia_foto_key || null, vende_desde: f.vende_desde ? Number(f.vende_desde) : null,
      });
      avisar("Estilo guardado. Tu tienda ya se ve así.");
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <Link href="/vendedor/tienda" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gris hover:text-tinta">
        <ArrowLeft className="size-4" /> Tu tienda
      </Link>
      <Encabezado titulo="Estilo de tu tienda" detalle="Dale tu toque: elige tus colores, la letra de los títulos y cómo se numeran tus pedidos.">
        <Link href="/vendedor/tienda/vista"><Boton variante="secundario">Ver mi tienda</Boton></Link>
        <Boton onClick={guardar} cargando={guardando} disabled={!cambiado}>Guardar cambios</Boton>
      </Encabezado>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Tarjeta className="space-y-4">
            <h3 className="text-lg font-extrabold text-tinta">Colores</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(TEMAS).map(([k, c]) => (
                <button
                  key={k}
                  onClick={() => setF({ ...f, tema_color: k })}
                  className={cn("relative rounded-2xl bg-white p-3 text-left ring-2 transition", f.tema_color === k ? "ring-tinta" : "ring-linea/70 hover:ring-linea")}
                >
                  <span className="flex h-12 overflow-hidden rounded-xl">
                    <span className="flex-1" style={{ background: c.pino }} />
                    <span className="w-1/3" style={{ background: c.coral }} />
                  </span>
                  <span className="mt-2 block text-sm font-bold text-tinta">{c.n}</span>
                  {f.tema_color === k && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-tinta text-white"><Check className="size-3.5" /></span>}
                </button>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta className="space-y-4">
            <h3 className="text-lg font-extrabold text-tinta">Letra de los títulos</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {Object.entries(FUENTES).map(([k, x]) => (
                <button
                  key={k}
                  onClick={() => setF({ ...f, tema_fuente: k })}
                  className={cn("rounded-2xl bg-white p-4 text-left ring-2 transition", f.tema_fuente === k ? "ring-tinta" : "ring-linea/70 hover:ring-linea")}
                >
                  <span className="block text-2xl font-extrabold text-tinta" style={{ fontFamily: x.css }}>{t.nombre}</span>
                  <span className="mt-1 block text-sm font-bold text-tinta">{x.n}</span>
                  <span className="text-xs text-gris">{x.detalle}</span>
                </button>
              ))}
            </div>
          </Tarjeta>

          <Tarjeta className="space-y-3">
            <h3 className="text-lg font-extrabold text-tinta">Producto destacado</h3>
            <Campo etiqueta="¿Qué producto quieres mostrar en grande?" ayuda="Si no eliges, mostramos el más vendido (o el más nuevo si aún no tienes ventas).">
              <Selector value={f.destacado_id} onChange={(e) => setF({ ...f, destacado_id: e.target.value })}>
                <option value="">Automático</option>
                {(productos.datos?.productos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </Selector>
            </Campo>
          </Tarjeta>

          <Tarjeta className="space-y-3">
            <h3 className="text-lg font-extrabold text-tinta">Aviso de tu tienda <span className="text-sm font-normal text-gris">(opcional)</span></h3>
            <Campo etiqueta="Un mensaje corto arriba de tu tienda" ayuda="Ej. “Envío gratis este fin de semana” o “Volvemos el lunes”. Déjalo vacío para no mostrar nada.">
              <Entrada value={f.aviso} onChange={(e) => setF({ ...f, aviso: e.target.value })} maxLength={90} placeholder="Escribe tu aviso" />
            </Campo>
          </Tarjeta>

          <Tarjeta className="space-y-4">
            <h3 className="text-lg font-extrabold text-tinta">Conoce a la emprendedora <span className="text-sm font-normal text-gris">(opcional)</span></h3>
            <p className="-mt-2 text-sm text-gris">A tus clientes les da confianza saber quién está detrás. Si no escribes nada, esta sección no aparece.</p>
            <div className="flex items-start gap-4">
              <label className="relative grid size-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl bg-crema text-gris ring-1 ring-linea">
                {f.historia_foto_url ? <img src={f.historia_foto_url} alt="" className="size-full object-cover" /> : <Camera className="size-6" />}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => subirFoto(e.target.files?.[0])} />
                {subiendo && <span className="absolute inset-0 grid place-items-center bg-white/70 text-xs font-bold text-tinta">Subiendo…</span>}
              </label>
              <div className="min-w-0 flex-1 space-y-2 text-sm text-gris">
                <p>Tu foto o la de tu taller. Toca el cuadro para subirla.</p>
                {f.historia_foto_url && (
                  <button onClick={() => setF({ ...f, historia_foto_key: "", historia_foto_url: "" })} className="inline-flex items-center gap-1 font-semibold text-error"><X className="size-4" /> Quitar foto</button>
                )}
              </div>
            </div>
            <Campo etiqueta="Tu historia" ayuda="Cuenta en pocas líneas cómo empezaste y qué hace especial lo que vendes.">
              <Area value={f.historia} onChange={(e) => setF({ ...f, historia: e.target.value })} maxLength={500} rows={4} placeholder="Ej. Empecé haciendo aretes para mis amigas y hoy cada pieza la hago a mano en mi taller de Miraflores." />
            </Campo>
            <Campo etiqueta="Vendo desde (año)">
              <Entrada inputMode="numeric" value={f.vende_desde} onChange={(e) => setF({ ...f, vende_desde: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="Ej. 2021" className="max-w-40" />
            </Campo>
          </Tarjeta>

          <Tarjeta className="space-y-3">
            <h3 className="text-lg font-extrabold text-tinta">Código de tus pedidos</h3>
            <Campo etiqueta="Prefijo (opcional)" ayuda="De 2 a 6 letras. Tus pedidos nuevos se numerarán desde 1001. Los anteriores conservan su código.">
              <Entrada value={f.prefijo_pedido} onChange={(e) => setF({ ...f, prefijo_pedido: e.target.value.toUpperCase().replace(/[^A-Za-z]/g, "").slice(0, 6) })} placeholder="Ej. LUNA" maxLength={6} />
            </Campo>
            <p className="rounded-xl bg-crema px-4 py-3 text-sm text-tinta">
              Tu próximo pedido se verá así: <b>{prefijo.length >= 2 ? `${prefijo}-1001` : "VG-10…"}</b>
              {prefijo.length >= 2 ? " · fácil de dictar por WhatsApp." : " (sin prefijo usas la numeración de VendiGo)."}
            </p>
          </Tarjeta>
        </div>

        {/* Vista previa con los colores elegidos */}
        <aside className="lg:sticky lg:top-24">
          <p className="mb-2 text-sm font-semibold text-gris">Así se verá</p>
          <div style={estiloTema(f)} className="overflow-hidden rounded-[26px] bg-crema ring-1 ring-linea/70">
            <div className="relative h-28 bg-pino bg-cover bg-center" style={t.portada_url ? { backgroundImage: `url(${t.portada_url})` } : undefined}>
              {!t.portada_url && <div className="absolute -right-10 -top-16 size-48 rounded-full bg-white/10" />}
            </div>
            <div className="relative -mt-10 flex flex-col items-center px-5 pb-6 text-center">
              <div className="size-20 overflow-hidden rounded-full bg-white ring-4 ring-crema">
                {t.logo_url ? <img src={t.logo_url} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-3xl font-extrabold text-pino" style={{ fontFamily: "var(--font-display)" }}>{t.nombre[0]}</span>}
              </div>
              <h2 className="mt-3 text-2xl font-extrabold text-tinta">{t.nombre}</h2>
              <p className="mt-1 text-sm text-gris">{t.descripcion || "Tu descripción aparece aquí."}</p>
              <div className="mt-4 w-full rounded-2xl bg-pino p-4 text-left text-white">
                <span className="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-bold">DESTACADO</span>
                <p className="mt-2 text-lg font-extrabold" style={{ fontFamily: "var(--font-display)" }}>Tu producto estrella</p>
              </div>
              <div className="mt-3 flex w-full gap-2">
                <span className="flex h-11 flex-1 items-center justify-center rounded-full bg-pino text-sm font-bold text-white">Comprar ahora</span>
                <span className="flex h-11 items-center gap-1.5 rounded-full bg-coral px-4 text-sm font-bold text-white"><ShoppingBag className="size-4" /> Agregar</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
