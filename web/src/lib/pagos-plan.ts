// Pagos que la tienda le hace a VendiGo (mensualidad del plan y extras).
// La tienda yapea a la cuenta de VendiGo y el equipo lo confirma; recién ahí se activa.
export type PagoPlan = {
  id: string;
  concepto: string;
  monto_centimos: number;
  metodo: string;
  estado: "pendiente" | "confirmado" | "rechazado";
  referencia: string;
  motivo_rechazo: string;
  fecha: string;
};
export type PagoVendiGo = { yape: string; titular: string };

export const METODOS: Record<string, string> = { yape: "Yape a VendiGo", tarjeta: "Tarjeta", plin: "Plin a VendiGo" };

export const ESTADO_PAGO_PLAN: Record<PagoPlan["estado"], { t: string; clase: string }> = {
  pendiente: { t: "Por confirmar", clase: "bg-aviso-claro text-aviso" },
  confirmado: { t: "Confirmado", clase: "bg-pino-claro text-pino" },
  rechazado: { t: "Rechazado", clase: "bg-error-claro text-error" },
};
