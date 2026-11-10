"use client";

import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";

type Fondo = { tope_centimos: number; dias_habiles: number };

// Tope y plazo vigentes del fondo de emergencia, tal como los configura el administrador.
export function TopeFondo() {
  const { datos } = useApi<{ fondo?: Fondo }>("/legal/proveedor");
  return <b>{datos?.fondo ? soles(datos.fondo.tope_centimos) : "el tope vigente"}</b>;
}

export function PlazoFondo() {
  const { datos } = useApi<{ fondo?: Fondo }>("/legal/proveedor");
  const d = datos?.fondo?.dias_habiles;
  return <b>{d ? `${d} ${d === 1 ? "día hábil" : "días hábiles"}` : "el plazo vigente en días hábiles"}</b>;
}
