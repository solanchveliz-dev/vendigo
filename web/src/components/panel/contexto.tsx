"use client";

import { createContext, useContext } from "react";
import type { Cobros, Usuario } from "@/lib/tipos";

export type Resumen = {
  pedidos: { por_aceptar: number; por_enviar: number; recogen: number; en_camino: number };
  reclamos_abiertos: number;
  preguntas_pendientes: number;
  ayudas_abiertas: number;
  notificaciones_no_leidas: number;
  vendido_hoy_centimos: number;
  vendido_mes_centimos: number;
  pedidos_mes: number;
  stock_bajo: number;
  clientes: number;
  productos_publicados: number;
  semana: { fecha: string; total_centimos: number }[];
  cobros: Cobros;
};

export type Panel = { usuario: Usuario; resumen: Resumen | null; recargarResumen: () => void };

export const PanelCtx = createContext<Panel | null>(null);

export function usePanel() {
  const p = useContext(PanelCtx);
  if (!p) throw new Error("usePanel fuera del panel");
  return p;
}
