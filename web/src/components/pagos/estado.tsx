import { cn } from "@/components/ui";
import type { Devolucion, PagoInfo } from "@/lib/tipos";

// Etiquetas del pago. VendiGo no recibe el dinero: el comprador le paga directo a la tienda.
const tonos: Record<string, string> = {
  pendiente: "bg-aviso-claro text-aviso",
  comprobante_enviado: "bg-aviso-claro text-aviso",
  paga_al_recibir: "bg-arena text-tinta",
  adelanto_informado: "bg-pino-claro text-pino",
  informado_tienda: "bg-ok-claro text-ok",
  confirmado: "bg-ok-claro text-ok",
  no_recibido: "bg-error-claro text-error",
  rechazado: "bg-error-claro text-error",
  reembolsado: "bg-arena text-tinta",
  de_prueba: "bg-[#ebe7df] text-tinta",
};

export function EtiquetaPago({ estado, texto, className }: { estado: string; texto: string; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", tonos[estado] ?? "bg-arena text-tinta", className)}>{texto}</span>;
}

export const ORIGEN: Record<PagoInfo["origen"], string> = {
  tienda: "Informado por la tienda",
  proveedor: "Validado por el proveedor de pagos",
  prueba: "Pedido de prueba (sin pago real)",
};

export const DEVOLUCION: Record<Devolucion["estado"], string> = {
  pendiente_tienda: "Pendiente: la tienda debe devolver el dinero",
  informada_tienda: "La tienda informó que devolvió el dinero",
  cubierta_vendigo: "VendiGo devolvió el dinero al comprador (fondo de emergencia)",
  confirmada_proveedor: "Devolución validada por el proveedor",
  de_prueba: "Devolución de prueba (sin dinero real)",
};

export const METODOS: Record<string, string> = {
  yape_directo: "Yape a la tienda",
  plin_directo: "Plin a la tienda",
  tarjeta_tienda: "Tarjeta (link de la tienda)",
  transferencia_tienda: "Transferencia a la tienda",
  efectivo: "Efectivo (pedido antiguo)",
  yape: "Yape",
  tarjeta: "Tarjeta",
  pagoefectivo: "PagoEfectivo",
  al_recibir: "Al recibir",
};
