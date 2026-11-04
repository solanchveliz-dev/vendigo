export function soles(centimos: number | null | undefined) {
  const v = (centimos ?? 0) / 100;
  return "S/ " + v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fecha(iso: string | null | undefined, conHora = false) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    ...(conHora ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "America/Lima",
  });
}

export function hace(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

// Convierte "45.90" en céntimos (4590).
export function aCentimos(texto: string) {
  const n = Number(String(texto).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const nombreEntrega: Record<string, string> = {
  recojo: "Recojo en tienda",
  agencia: "Agencia",
  motorizado: "Motorizado",
};

export const nombrePago: Record<string, string> = {
  yape: "Yape",
  tarjeta: "Tarjeta",
  pagoefectivo: "PagoEfectivo",
  al_recibir: "Paga al recibir",
};
