import type { CSSProperties } from "react";

// Colores y letras que la tienda puede elegir para su página (los mismos que valida la API).
export const TEMAS: Record<string, { n: string; pino: string; coral: string }> = {
  clasico: { n: "VendiGo", pino: "#103b38", coral: "#f36b50" },
  rosa: { n: "Rosa", pino: "#6b2346", coral: "#e46a8f" },
  frambuesa: { n: "Frambuesa", pino: "#5b1630", coral: "#d6335c" },
  lavanda: { n: "Lavanda", pino: "#3b2d6b", coral: "#9277de" },
  oceano: { n: "Océano", pino: "#0f3b57", coral: "#2f9cc4" },
  oliva: { n: "Oliva", pino: "#34431b", coral: "#94a83c" },
  tierra: { n: "Tierra", pino: "#4a2e1a", coral: "#cf843a" },
  noche: { n: "Noche", pino: "#1d2430", coral: "#e0a43a" },
};

export const FUENTES: Record<string, { n: string; detalle: string; css: string }> = {
  moderna: { n: "Moderna", detalle: "Clara y actual", css: '"Manrope Variable", system-ui, sans-serif' },
  elegante: { n: "Elegante", detalle: "Con serifa, para marcas finas", css: '"Playfair Display Variable", Georgia, serif' },
  simple: { n: "Simple", detalle: "Redonda y amable", css: '"DM Sans Variable", system-ui, sans-serif' },
};

// Variables CSS que cambian los colores y la letra de títulos solo dentro de la página de la tienda.
export function estiloTema(t: { tema_color?: string; tema_fuente?: string }): CSSProperties {
  const c = TEMAS[t.tema_color ?? ""] ?? TEMAS.clasico;
  const f = FUENTES[t.tema_fuente ?? ""] ?? FUENTES.moderna;
  return {
    "--color-pino": c.pino,
    "--color-pino-2": `color-mix(in srgb, ${c.pino} 85%, white)`,
    "--color-pino-claro": `color-mix(in srgb, ${c.pino} 12%, white)`,
    "--color-coral": c.coral,
    "--color-coral-claro": `color-mix(in srgb, ${c.coral} 14%, white)`,
    "--font-display": f.css,
  } as CSSProperties;
}
