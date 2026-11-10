"use client";

import { useState } from "react";
import { Clock, Copy, CreditCard, ExternalLink, Landmark, Smartphone } from "lucide-react";
import { api, ErrorApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { Aviso, Boton, Campo, Entrada, cn, useAvisar } from "@/components/ui";
import type { PagoVendiGo } from "@/lib/pagos-plan";

type Metodo = PagoVendiGo["metodos"][number];
const NOMBRE: Record<Metodo, { t: string; icono: React.ReactNode }> = {
  yape: { t: "Yape", icono: <Smartphone className="size-4" /> },
  plin: { t: "Plin", icono: <Smartphone className="size-4" /> },
  tarjeta: { t: "Tarjeta", icono: <CreditCard className="size-4" /> },
  transferencia: { t: "Transferencia", icono: <Landmark className="size-4" /> },
};
const MARCA: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", diners: "Diners Club" };

function Dato({ k, v, copiar }: { k: string; v: string; copiar?: boolean }) {
  const avisar = useAvisar();
  return (
    <div className="rounded-2xl bg-white/70 p-3">
      <p className="text-xs text-gris">{k}</p>
      <p className="break-all font-bold text-tinta">{v}</p>
      {copiar && (
        <button onClick={() => navigator.clipboard?.writeText(v).then(() => avisar("Copiado"), () => undefined)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-pino">
          <Copy className="size-3.5" /> Copiar
        </button>
      )}
    </div>
  );
}

// Datos para pagarle a VendiGo con el método que elija la tienda, y registro del n.° de operación en la app.
// Si se pasa pagoId, informa un pago pendiente ya creado (planes, ventas extra). Si se pasa alPagar, lo usa el que llama (impulsos).
export function PagarAVendiGo({
  concepto, monto, vendigo, pagoId, referenciaInformada, alPagar, alListo, boton = "Ya pagué",
}: {
  concepto: string;
  monto: number;
  vendigo: PagoVendiGo | null;
  pagoId?: string;
  referenciaInformada?: string;
  alPagar?: (metodo: Metodo, referencia: string) => Promise<void>;
  alListo?: () => void;
  boton?: string;
}) {
  const avisar = useAvisar();
  const metodos = vendigo?.metodos ?? [];
  const [metodo, setMetodo] = useState<Metodo | "">(metodos[0] ?? "");
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!metodo) return;
    setError("");
    setEnviando(true);
    try {
      if (alPagar) await alPagar(metodo, ref.trim());
      else if (pagoId) {
        const r = await api.post<{ mensaje: string }>(`/vendedor/plan/pagos/${pagoId}/informar`, { metodo, referencia: ref.trim() });
        avisar(r.mensaje);
      }
      setRef("");
      alListo?.();
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="rounded-[22px] bg-aviso-claro/70 p-5 ring-1 ring-aviso/20">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-aviso"><Clock className="size-5" /></span>
        <div className="min-w-0 flex-1 space-y-3 text-sm text-tinta">
          <p className="font-bold">Paga a VendiGo: {concepto} · {soles(monto)}</p>
          {referenciaInformada ? (
            <p>Ya nos avisaste tu pago (op. {referenciaInformada}). VendiGo lo está revisando y te avisa cuando esté activo.</p>
          ) : !metodos.length ? (
            <p>VendiGo todavía no configuró cómo recibir pagos. Escríbenos desde Ayuda.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {metodos.map((m) => (
                  <button key={m} type="button" onClick={() => setMetodo(m)} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold", metodo === m ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea")}>
                    {NOMBRE[m].icono} {NOMBRE[m].t}
                  </button>
                ))}
              </div>
              {vendigo && metodo === "yape" && <div className="grid gap-2 sm:grid-cols-2"><Dato k="Yape de VendiGo" v={vendigo.yape} copiar /><Dato k="Titular" v={vendigo.titular} /></div>}
              {vendigo && metodo === "plin" && <div className="grid gap-2 sm:grid-cols-2"><Dato k="Plin de VendiGo" v={vendigo.plin} copiar /><Dato k="Titular" v={vendigo.titular} /></div>}
              {vendigo && metodo === "tarjeta" && (
                <div className="rounded-2xl bg-white/70 p-3">
                  <p className="text-xs text-gris">Tarjeta{vendigo.tarjeta_marcas.length ? ` · ${vendigo.tarjeta_marcas.map((x) => MARCA[x] ?? x).join(", ")}` : ""}</p>
                  <a href={vendigo.tarjeta_link} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex">
                    <Boton tamano="sm"><CreditCard className="size-4" /> Pagar {soles(monto)} con tarjeta <ExternalLink className="size-3.5" /></Boton>
                  </a>
                </div>
              )}
              {vendigo && metodo === "transferencia" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Dato k="Banco" v={vendigo.banco} />
                  <Dato k="Titular" v={vendigo.banco_titular} />
                  {vendigo.cuenta && <Dato k="N.° de cuenta" v={vendigo.cuenta} copiar />}
                  {vendigo.cci && <Dato k="CCI" v={vendigo.cci} copiar />}
                </div>
              )}
              <Campo etiqueta="N.° de operación de tu pago">
                <Entrada value={ref} onChange={(e) => setRef(e.target.value.replace(/\s/g, ""))} maxLength={40} placeholder="Ej. 12345678" />
              </Campo>
              {error && <Aviso tono="error">{error}</Aviso>}
              <Boton onClick={enviar} cargando={enviando} disabled={!metodo || ref.trim().length < 4}>{boton}</Boton>
              <p className="text-xs text-gris">VendiGo compara tu n.° de operación con lo recibido y lo activa. Te avisamos.</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
