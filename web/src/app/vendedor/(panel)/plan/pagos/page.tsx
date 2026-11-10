"use client";

import Link from "next/link";
import { ChevronRight, ReceiptText } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { Boton, Cargando, Vacio } from "@/components/ui";
import { ESTADO_PAGO_PLAN, METODOS, type PagoPlan, type PagoVendiGo } from "@/lib/pagos-plan";
import { PagarAVendiGo } from "@/components/panel/pagar-vendigo";


// "Pagos de tu plan": lo que la tienda le paga a VendiGo (mensualidad y extras).
export default function PagosDelPlan() {
  const { datos, recargar } = useApi<{ pagos: PagoPlan[]; pago_vendigo: PagoVendiGo }>("/vendedor/plan/pagos");

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/plan" className="hover:text-pino">Tu suscripción</Link> <ChevronRight className="size-3.5" /> Pagos
      </p>
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Pagos de tu plan</h1>
        <p className="text-sm text-gris">Lo que le pagas a VendiGo con Culqi: tu plan, ventas extra, impulsos y créditos de IA. Es aparte de tus ventas: tus clientes te pagan directo a ti.</p>
      </div>
      {datos?.pagos.filter((p) => p.estado === "pendiente").map((p) => <PagarAVendiGo key={p.id} concepto={p.concepto} monto={p.monto_centimos} vendigo={datos.pago_vendigo} pagoId={p.id} referenciaInformada={p.referencia_tienda} alListo={recargar} />)}

      {!datos ? (
        <Cargando />
      ) : !datos.pagos.length ? (
        <Vacio icono={<ReceiptText className="size-6" />} titulo="Aún no tienes pagos" detalle="Cuando cambies a un plan de pago o compres ventas extra, aparecen aquí." />
      ) : (
        <div className="overflow-x-auto rounded-[22px] bg-white shadow-suave ring-1 ring-linea/60">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs font-semibold text-gris">
                <th className="px-5 py-3.5">Fecha</th>
                <th className="px-5 py-3.5">Concepto</th>
                <th className="px-5 py-3.5">Método</th>
                <th className="px-5 py-3.5 text-right">Monto</th>
                <th className="px-5 py-3.5">Estado</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-linea">
              {datos.pagos.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-3.5">{new Date(p.fecha).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
                  <td className="px-5 py-3.5">{p.concepto}</td>
                  <td className="px-5 py-3.5">{p.monto_centimos ? METODOS[p.metodo] ?? p.metodo : "—"}</td>
                  <td className="px-5 py-3.5 text-right font-bold">{soles(p.monto_centimos)}</td>
                  <td className="px-5 py-3.5">
                    <span className={p.monto_centimos ? `rounded-full px-2.5 py-1 text-xs font-bold ${ESTADO_PAGO_PLAN[p.estado].clase}` : "rounded-full bg-arena px-2.5 py-1 text-xs font-bold text-gris"}>
                      ● {p.monto_centimos ? ESTADO_PAGO_PLAN[p.estado].t : "Gratis"}
                    </span>
                    {p.estado === "rechazado" && p.motivo_rechazo && <span className="mt-1 block text-xs text-error">{p.motivo_rechazo}</span>}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {p.monto_centimos > 0 && p.estado === "confirmado" && (
                      <Link href={`/vendedor/plan/pagos/${p.id}`}>
                        <Boton variante="secundario" tamano="sm"><ReceiptText className="size-4" /> Constancia</Boton>
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-linea px-5 py-3 text-xs text-gris">Mostrando {datos.pagos.length} de {datos.pagos.length}</p>
        </div>
      )}
    </div>
  );
}
