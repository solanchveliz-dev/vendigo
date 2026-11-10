"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, ImagePlus, Info, ShieldCheck, Trash2 } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { subirImagen } from "@/lib/subir";
import type { Tienda } from "@/lib/tipos";
import { Aviso, Boton, Campo, Cargando, Entrada, useAvisar } from "@/components/ui";

type Datos = { yape: string; plin: string; titular: string; qrKey: string | null; qrUrl: string };
const celular = (v: string) => v === "" || /^9\d{8}$/.test(v);

// Datos para que el cliente le pague directo a la tienda. VendiGo no recibe ese dinero.
export default function ComoTePagan() {
  const { datos: t, setDatos } = useApi<Tienda>("/vendedor/tienda");
  const avisar = useAvisar();
  const archivo = useRef<HTMLInputElement>(null);
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (t && !d) setD({ yape: t.yape_numero ?? "", plin: t.plin_numero ?? "", titular: t.pago_titular ?? "", qrKey: t.pago_qr_key, qrUrl: t.pago_qr_url ?? "" });
  }, [t, d]);
  if (!t || !d) return <Cargando />;
  const cambiar = (x: Partial<Datos>) => setD({ ...d, ...x });

  async function subirQR(f: File | undefined) {
    if (!f) return;
    setSubiendo(true);
    try {
      const r = await subirImagen(f, "pago_qr");
      cambiar({ qrKey: r.key, qrUrl: r.url });
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  async function guardar() {
    setError("");
    if (!celular(d!.yape)) return setError("El número de Yape debe tener 9 dígitos y empezar con 9.");
    if (!celular(d!.plin)) return setError("El número de Plin debe tener 9 dígitos y empezar con 9.");
    if (!d!.yape && !d!.plin) return setError("Agrega tu número de Yape o de Plin para que tus clientes te paguen.");
    if (d!.titular.trim().length < 3) return setError("Escribe el nombre que aparece en tu Yape o Plin.");
    setGuardando(true);
    try {
      const nueva = await api.put<Tienda>("/vendedor/tienda/pagos", {
        yape_numero: d!.yape,
        plin_numero: d!.plin,
        pago_titular: d!.titular.trim(),
        pago_qr_key: d!.qrKey ?? "",
      });
      setDatos(nueva);
      avisar("Datos de pago guardados");
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/tienda" className="hover:text-tinta">Tienda</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-tinta">Cómo te pagan</span>
      </nav>
      <div className="mb-6">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[28px] font-extrabold leading-tight text-pino">¿Cómo te pagan tus clientes?</h1>
        <p className="mt-1 text-sm text-gris">El cliente te paga directo a ti. por Yape o Plin (no se acepta efectivo). VendiGo no recibe ni guarda tu dinero, y no cobra comisión por venta.</p>
      </div>

      {error && <Aviso tono="error" className="mb-4">{error}</Aviso>}

      <div className="space-y-4">
        <section className="space-y-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
          <h3 className="text-lg font-extrabold text-tinta">Yape y Plin</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Número de Yape" ayuda="Déjalo vacío si no usas Yape.">
              <Entrada inputMode="numeric" maxLength={9} value={d.yape} onChange={(e) => cambiar({ yape: e.target.value.replace(/\D/g, "") })} placeholder="9XXXXXXXX" />
            </Campo>
            <Campo etiqueta="Número de Plin" ayuda="Déjalo vacío si no usas Plin.">
              <Entrada inputMode="numeric" maxLength={9} value={d.plin} onChange={(e) => cambiar({ plin: e.target.value.replace(/\D/g, "") })} placeholder="9XXXXXXXX" />
            </Campo>
          </div>
          <Campo etiqueta="Nombre del titular" ayuda="Tal como aparece en tu Yape o Plin. Así tu cliente confirma que te paga a ti.">
            <Entrada value={d.titular} onChange={(e) => cambiar({ titular: e.target.value })} maxLength={80} placeholder="Ej. María P. Quispe" />
          </Campo>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-tinta">Código QR (opcional)</p>
            <div className="flex items-center gap-4">
              {d.qrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.qrUrl} alt="QR de pago" className="size-28 rounded-2xl object-contain ring-1 ring-linea" />
              ) : (
                <span className="grid size-28 place-items-center rounded-2xl bg-crema/70 text-gris ring-1 ring-linea"><ImagePlus className="size-6" /></span>
              )}
              <div className="space-y-2">
                <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => subirQR(e.target.files?.[0])} />
                <Boton tamano="sm" variante="secundario" cargando={subiendo} onClick={() => archivo.current?.click()}>{d.qrUrl ? "Cambiar QR" : "Subir QR"}</Boton>
                {d.qrUrl && (
                  <button onClick={() => cambiar({ qrKey: null, qrUrl: "" })} className="flex items-center gap-1 text-xs font-semibold text-error"><Trash2 className="size-3.5" /> Quitar</button>
                )}
                <p className="text-xs text-gris">Captura del QR de tu app Yape o Plin.</p>
              </div>
            </div>
          </div>
        </section>


        <div className="flex gap-3 rounded-2xl bg-pino-claro px-4 py-3 text-sm text-pino">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <span>Tu número solo lo ve el cliente después de hacer su pedido, en su página de seguimiento. No aparece en tu tienda pública.</span>
        </div>
        <div className="flex gap-3 rounded-2xl bg-crema/70 px-4 py-3 text-sm text-tinta">
          <Info className="mt-0.5 size-5 shrink-0 text-pino" />
          <span>Cuando te llegue un pago, entra al pedido y toca <b>Revisar el pago</b>. Si pagan completo o adelanto, recién ahí podrás enviarlo. Si pagan al recibir, confirmas el pago antes de entregar. Cuándo pagan lo eliges en <Link href="/vendedor/tienda/entrega" className="font-semibold underline">Entrega</Link>.</span>
        </div>

        <Boton tamano="lg" onClick={guardar} cargando={guardando}>Guardar</Boton>
      </div>
    </div>
  );
}
