"use client";

import { Clock, Copy } from "lucide-react";
import { soles } from "@/lib/formato";
import { useAvisar } from "@/components/ui";
import type { PagoPlan, PagoVendiGo } from "@/lib/pagos-plan";

// Instrucciones para pagar el plan con Yape a VendiGo. Se activa cuando el equipo lo confirma.
export function YapeVendiGo({ pago, vendigo }: { pago: Pick<PagoPlan, "concepto" | "monto_centimos">; vendigo: PagoVendiGo | null }) {
  const avisar = useAvisar();
  return (
    <section className="rounded-[22px] bg-aviso-claro/70 p-5 ring-1 ring-aviso/20">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-aviso"><Clock className="size-5" /></span>
        <div className="min-w-0 flex-1 text-sm text-tinta">
          <p className="font-bold">Pago por confirmar: {pago.concepto} · {soles(pago.monto_centimos)}</p>
          {vendigo?.yape ? (
            <>
              <p className="mt-1">
                Yapea <b>{soles(pago.monto_centimos)}</b> al <b>{vendigo.yape}</b>
                {vendigo.titular && <> ({vendigo.titular})</>} y escribe el nombre de tu tienda en el mensaje.
              </p>
              <button
                onClick={() => navigator.clipboard?.writeText(vendigo.yape).then(() => avisar("Número copiado"), () => undefined)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-pino"
              >
                <Copy className="size-3.5" /> Copiar número
              </button>
            </>
          ) : (
            <p className="mt-1">VendiGo te enviará los datos para pagar. Escríbenos desde Ayuda si tienes dudas.</p>
          )}
          <p className="mt-2 text-xs text-gris">Cuando el equipo de VendiGo confirme que recibió el pago, se activa y te avisamos.</p>
        </div>
      </div>
    </section>
  );
}
