export type Cliente = {
  id: string;
  nombre: string;
  celular: string;
  lugar: string;
  pedidos: number;
  total_centimos: number;
  primera_compra: string;
  ultima_compra: string;
  frecuencia: "nueva" | "ocasional" | "mensual" | "frecuente";
};

export const FRECUENCIAS: Record<Cliente["frecuencia"], { texto: string; tono: "aviso" | "pino" | "neutro" | "ok"; detalle: string }> = {
  frecuente: { texto: "Frecuente", tono: "ok", detalle: "4 pedidos o más" },
  mensual: { texto: "Mensual", tono: "pino", detalle: "Vuelve a comprar en meses distintos" },
  ocasional: { texto: "Ocasional", tono: "neutro", detalle: "Compró 2 o 3 veces en el mismo mes" },
  nueva: { texto: "Nueva", tono: "aviso", detalle: "Su primer pedido" },
};

export function iniciales(n: string) {
  return n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export function celularBonito(c: string) {
  return c.length === 9 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}` : c;
}
