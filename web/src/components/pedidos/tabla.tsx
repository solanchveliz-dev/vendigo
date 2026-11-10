"use client";

import Link from "next/link";
import { Bike, Package, Store } from "lucide-react";
import { fecha, nombreEntrega, soles } from "@/lib/formato";
import type { PedidoResumen } from "@/lib/tipos";
import { Insignia } from "@/components/ui";
import { EstadoPedido } from "./estado";

export const iconoEntrega = { recojo: Store, agencia: Package, motorizado: Bike };

// Estado del pago que el cliente le hace directo a la tienda.
export function textoPago(p: PedidoResumen) {
  const tono = ({ informado_tienda: "ok", confirmado: "ok", paga_al_recibir: "neutro", de_prueba: "neutro", pendiente: "aviso", comprobante_enviado: "aviso", no_recibido: "error", rechazado: "error" } as const)[p.pago_estado as "pendiente"] ?? "neutro";
  return { texto: p.pago_texto || p.pago_estado, tono };
}

const siguiente: Record<string, string> = {
  por_aceptar: "Aceptar pedido",
  preparando: "Ya lo envié",
  listo_recojo: "Entregar al cliente",
};

export function siguientePaso(p: PedidoResumen) {
  if (p.reclamo === "abierto") return "Ver reclamo";
  if (p.pago_estado === "comprobante_enviado") return "Revisar pago";
  if (p.estado === "preparando" && ["pendiente", "no_recibido"].includes(p.pago_estado)) return "Esperando pago";
  if (p.estado === "enviado" && p.entrega === "motorizado") return "Entregar";
  if (p.estado === "preparando" && p.entrega === "recojo") return "Ya está listo";
  if (p.estado === "preparando" && p.entrega === "motorizado") return "Ya salió";
  return siguiente[p.estado];
}

// El despacho (agencia, motorizado o recojo listo) tiene su propia pantalla, como en el prototipo.
export function enlacePaso(p: PedidoResumen) {
  if (p.estado === "preparando" && p.reclamo !== "abierto" && !["pendiente", "comprobante_enviado", "no_recibido"].includes(p.pago_estado)) return `/vendedor/pedidos/${p.id}/enviar`;
  return `/vendedor/pedidos/${p.id}`;
}

export function TablaPedidos({ pedidos, compacta }: { pedidos: PedidoResumen[]; compacta?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={compacta ? "w-full text-sm" : "w-full min-w-[720px] text-sm"}>
        <thead>
          <tr className="text-left text-xs font-semibold text-gris">
            <th className="px-4 py-3">Número</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Entrega</th>
            {!compacta && <th className="px-4 py-3">Pago</th>}
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3 text-right">Total</th>
            {!compacta && <th className="px-4 py-3 text-right">Siguiente paso</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-linea">
          {pedidos.map((p) => {
            const Icono = iconoEntrega[p.entrega];
            const pago = textoPago(p);
            const paso = siguientePaso(p);
            return (
              <tr key={p.id} className="hover:bg-crema/60">
                <td className="px-4 py-3">
                  <Link href={`/vendedor/pedidos/${p.id}`} className="font-semibold text-tinta hover:underline">
                    {p.codigo}
                  </Link>
                  <span className="block text-xs text-gris">{fecha(p.creado_en, true)}</span>
                </td>
                <td className="px-4 py-3">{p.comprador}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Icono className="size-4 text-gris" /> {nombreEntrega[p.entrega]}
                  </span>
                </td>
                {!compacta && (
                  <td className="px-4 py-3">
                    <Insignia tono={pago.tono}>{pago.texto}</Insignia>
                  </td>
                )}
                <td className="px-4 py-3">
                  <EstadoPedido estado={p.estado} texto={p.reclamo && ["abierto", "en_revision"].includes(p.reclamo) ? "Con reclamo" : p.estado_texto} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{soles(p.total_centimos)}</td>
                {!compacta && (
                  <td className="px-4 py-3 text-right">
                    {paso ? (
                      <Link href={enlacePaso(p)} className="inline-flex h-8 items-center rounded-full bg-pino px-3.5 text-xs font-semibold text-white">
                        {paso}
                      </Link>
                    ) : (
                      <span className="text-xs text-gris">{p.estado === "enviado" ? "Esperando al cliente" : "—"}</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
