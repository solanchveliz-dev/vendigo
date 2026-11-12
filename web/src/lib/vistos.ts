"use client";

// Vistos recientemente: se guardan solo en este navegador (no viajan a la API).
export type Visto = { id: string; nombre: string; slug: string; tienda: string; imagen: string; precio: number; visto: number };

const CLAVE = "vg:vistos";
const MAX = 24;

export function leerVistos(): Visto[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function guardarVisto(v: Omit<Visto, "visto">) {
  try {
    const lista = [{ ...v, visto: Date.now() }, ...leerVistos().filter((x) => x.id !== v.id)].slice(0, MAX);
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento: no se guarda */
  }
}

export function borrarVistos() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada */
  }
}
