// Pagos que la tienda le hace a VendiGo: plan, ventas extra, impulsos y créditos de IA.
// Se pagan solo con Culqi (tarjeta o Yape) y se activan en cuanto Culqi aprueba el cobro.
export type PagoPlan = {
  id: string;
  concepto: string;
  monto_centimos: number;
  metodo: string;
  estado: "pendiente" | "confirmado" | "rechazado" | "de_prueba";
  referencia: string;
  referencia_tienda: string;
  motivo_rechazo: string;
  fecha: string;
};
// Qué compró la tienda en cada cobro de VendiGo.
export const TIPO_COBRO: Record<string, { t: string; d: string }> = {
  plan: { t: "Plan", d: "Mensualidad del plan de la tienda" },
  ventas_extra: { t: "Ventas extra", d: "+20 ventas en el mes, cuando llega al límite de su plan" },
  destacado: { t: "Impulso", d: "Su producto sale primero en las búsquedas por unos días" },
  creditos_ia: { t: "Créditos de IA", d: "+100 créditos para las herramientas de IA" },
  proteccion: { t: "Protección (anterior)", d: "Servicio que ya no se ofrece" },
};

// Métodos con los que se registraron los pagos a VendiGo (hoy solo Culqi; los demás son de pagos antiguos).
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
  pendiente: { t: "Pendiente de pago", clase: "bg-aviso-claro text-aviso" },
  confirmado: { t: "Pagado", clase: "bg-pino-claro text-pino" },
  rechazado: { t: "Rechazado", clase: "bg-error-claro text-error" },
  de_prueba: { t: "De prueba", clase: "bg-arena text-gris" },
};
