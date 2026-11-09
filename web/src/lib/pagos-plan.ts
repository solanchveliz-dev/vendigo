// Pagos que la tienda le hace a VendiGo (mensualidad del plan y extras).
export type PagoPlan = { id: string; concepto: string; monto_centimos: number; metodo: string; fecha: string };

export const METODOS: Record<string, string> = { tarjeta: "Tarjeta (Culqi)", yape: "Yape (Culqi)" };
