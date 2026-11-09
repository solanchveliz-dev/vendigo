"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, ShoppingBag } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { FUENTES, TEMAS, estiloTema } from "@/lib/tema";
import type { Tienda } from "@/lib/tipos";
import { Boton, Campo, Cargando, Encabezado, Entrada, Tarjeta, cn, useAvisar } from "@/components/ui";

// Personaliza cómo se ve tu tienda: color, letra de los títulos y el código de tus pedidos.
export default function EstiloTienda() {
  const avisar = useAvisar();
  const { datos: t, recargar } = useApi<Tienda>("/vendedor/tienda");
  const [f, setF] = useState({ tema_color: "clasico", tema_fuente: "moderna", prefijo_pedido: "" });
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    if (t) setF({ tema_color: t.tema_color, tema_fuente: t.tema_fuente, prefijo_pedido: t.prefijo_pedido });
  }, [t]);
  if (!t) return <Cargando />;

  const prefijo = f.prefijo_pedido.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
  const cambiado = f.tema_color !== t.tema_color || f.tema_fuente !== t.tema_fuente || prefijo !== t.prefijo_pedido;

  async function guardar() {
    setGuardando(true);
    try {
      await api.put("/vendedor/tienda/estilo", { ...f, prefijo_pedido: prefijo });
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
        <a href={`/t/${t.slug}`} target="_blank" rel="noreferrer"><Boton variante="secundario">Ver mi tienda</Boton></a>
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
