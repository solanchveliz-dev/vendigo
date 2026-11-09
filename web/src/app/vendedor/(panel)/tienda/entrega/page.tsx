"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { agencias } from "@/lib/catalogos";
import { aCentimos } from "@/lib/formato";
import type { Entrega, Tienda } from "@/lib/tipos";
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Interruptor, Tarjeta, cn, useAvisar } from "@/components/ui";

export default function FormasDeEntrega() {
  const { datos: t, setDatos } = useApi<Tienda>("/vendedor/tienda");
  const avisar = useAvisar();
  const [e, setE] = useState<Entrega | null>(null);
  const [costo, setCosto] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (t) {
      setE(t.entrega);
      setCosto((t.entrega.costo_motorizado_centimos / 100).toFixed(2));
    }
  }, [t]);
  if (!e) return <Cargando />;

  async function guardar() {
    setError("");
    setGuardando(true);
    try {
      setDatos(await api.put<Tienda>("/vendedor/tienda/entrega", { ...e, costo_motorizado_centimos: aCentimos(costo) }));
      avisar("Formas de entrega guardadas.");
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  const toggleAgencia = (a: string) => setE({ ...e!, agencias: e!.agencias.includes(a) ? e!.agencias.filter((x) => x !== a) : [...e!.agencias, a] });

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/vendedor/tienda" className="inline-flex items-center gap-1 text-sm font-semibold text-pino">
        <ArrowLeft className="size-4" /> Mi tienda
      </Link>
      <Encabezado titulo="Formas de entrega" detalle="Tus clientes eligen una de estas al comprar." />
      {error && <Aviso tono="error">{error}</Aviso>}
      <Tarjeta className="space-y-3">
        <Interruptor activo={e.recojo} onChange={(v) => setE({ ...e, recojo: v })} etiqueta="Recojo en tienda" detalle="El cliente recoge y muestra su código de 4 dígitos." />
        {e.recojo && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Dirección"><Entrada value={e.direccion_recojo} onChange={(x) => setE({ ...e, direccion_recojo: x.target.value })} /></Campo>
            <Campo etiqueta="Horario">
              <Link href="/vendedor/tienda" className="block rounded-xl bg-crema px-4 py-2.5 text-sm ring-1 ring-linea hover:ring-pino/40">
                {t?.horario || "Aún no pones tu horario"} <span className="font-semibold text-coral">· cambiar</span>
              </Link>
              <span className="mt-1 block text-xs text-gris">Es tu horario de atención, se cambia en Tu tienda.</span>
            </Campo>
          </div>
        )}
      </Tarjeta>
      <Tarjeta className="space-y-3">
        <Interruptor activo={e.agencia} onChange={(v) => setE({ ...e, agencia: v })} etiqueta="Envío por agencia" detalle="Para todo el Perú. Tú registras la boleta como prueba." />
        {e.agencia && (
          <div className="flex flex-wrap gap-2">
            {agencias.map((a) => (
              <button key={a} type="button" onClick={() => toggleAgencia(a)} className={cn("h-9 rounded-full px-4 text-sm font-semibold ring-1", e.agencias.includes(a) ? "bg-pino text-white ring-pino" : "bg-white ring-linea")}>
                {a}
              </button>
            ))}
          </div>
        )}
      </Tarjeta>
      <Tarjeta className="space-y-3">
        <Interruptor activo={e.motorizado} onChange={(v) => setE({ ...e, motorizado: v })} etiqueta="Motorizado" detalle="El cliente siempre paga al recibir, desde su app. Si no llega, no paga." />
        {e.motorizado && (
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Campo etiqueta="Costo (S/)"><Entrada value={costo} onChange={(x) => setCosto(x.target.value)} inputMode="decimal" /></Campo>
            <Campo etiqueta="Zonas"><Entrada value={e.zonas_motorizado} onChange={(x) => setE({ ...e, zonas_motorizado: x.target.value })} placeholder="Miraflores, Surco, San Isidro" /></Campo>
          </div>
        )}
      </Tarjeta>
      <Boton variante="acento" tamano="lg" cargando={guardando} onClick={guardar}>
        Guardar
      </Boton>
    </div>
  );
}
