// Pagos que la tienda le hace a VendiGo (mensualidad del plan y extras).
// La tienda yapea a la cuenta de VendiGo y el equipo lo confirma; recién ahí se activa.
export type PagoPlan = {
  id: string;
  concepto: string;
  monto_centimos: number;
  metodo: string;
  estado: "pendiente" | "confirmado" | "rechazado";
  referencia: string;
  referencia_tienda: string;
  motivo_rechazo: string;
  fecha: string;
};
// Métodos con los que las tiendas le pagan a VendiGo (los configura el admin).
export type PagoVendiGo = {
  yape: string;
  plin: string;
  titular: string;
  tarjeta_link: string;
  tarjeta_marcas: string[];
  banco: string;
  cuenta: string;
  cci: string;
  banco_titular: string;
  metodos: ("culqi" | "yape" | "plin" | "tarjeta" | "transferencia")[];
  culqi_publica: string;
};

export const METODOS: Record<string, string> = { culqi: "Culqi (tarjeta o Yape)", yape: "Yape a VendiGo", plin: "Plin a VendiGo", tarjeta: "Tarjeta", transferencia: "Transferencia a VendiGo" };

export const ESTADO_PAGO_PLAN: Record<PagoPlan["estado"], { t: string; clase: string }> = {
  pendiente: { t: "Por confirmar", clase: "bg-aviso-claro text-aviso" },
  confirmado: { t: "Confirmado", clase: "bg-pino-claro text-pino" },
  rechazado: { t: "Rechazado", clase: "bg-error-claro text-error" },
};
