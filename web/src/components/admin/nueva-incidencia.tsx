"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Flag } from "lucide-react";
import { api, ErrorApi } from "@/lib/api";
import { TIPO_INCIDENCIA } from "@/lib/admin";
import { Area, Boton, Entrada, Modal, useAvisar } from "@/components/ui";

const sel = "h-11 w-full rounded-xl border border-linea bg-white px-3 text-sm outline-none focus:border-pino";

// Botón + formulario para abrir una incidencia (desde la lista o desde un pedido).
export function NuevaIncidencia({ pedido, texto = "Abrir incidencia" }: { pedido?: string; texto?: string }) {
  const avisar = useAvisar();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [f, setF] = useState({ titulo: "", descripcion: "", tipo: "entrega", prioridad: "media", origen: pedido ? "comprador" : "equipo", pedido: pedido ?? "" });

  async function crear() {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string; numero: number }>("/admin/incidencias", f);
      avisar(r.mensaje);
      router.push(`/admin/incidencias/INC-${r.numero}`);
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
      setEnviando(false);
    }
  }

  return (
    <>
      <button onClick={() => setAbierto(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-tinta ring-1 ring-linea hover:ring-pino/40">
        <Flag className="size-4" /> {texto}
      </button>
      <Modal abierto={abierto} onCerrar={() => setAbierto(false)} titulo={pedido ? `Abrir incidencia · ${pedido}` : "Nueva incidencia"}>
        <div className="space-y-3">
          <Entrada value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Título (ej. Pedido no entregado)" maxLength={120} />
          <Area value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="¿Qué pasó? Escribe lo que reportaron o lo que viste." maxLength={2000} />
          <div className="grid grid-cols-2 gap-3">
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} className={sel} aria-label="Tipo">
              {Object.entries(TIPO_INCIDENCIA).map(([k, t]) => <option key={k} value={k}>Tipo: {t}</option>)}
            </select>
            <select value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value })} className={sel} aria-label="Prioridad">
              <option value="alta">Prioridad: Alta</option>
              <option value="media">Prioridad: Media</option>
              <option value="baja">Prioridad: Baja</option>
            </select>
            <select value={f.origen} onChange={(e) => setF({ ...f, origen: e.target.value })} className={sel} aria-label="Quién lo reporta">
              <option value="comprador">Lo reporta: Comprador</option>
              <option value="vendedor">Lo reporta: Vendedora</option>
              <option value="equipo">Lo reporta: Equipo VendiGo</option>
            </select>
            <Entrada value={f.pedido} onChange={(e) => setF({ ...f, pedido: e.target.value })} placeholder="Pedido (opcional) VG-…" disabled={!!pedido} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Boton>
          <Boton onClick={crear} cargando={enviando} disabled={f.titulo.trim().length < 5 || f.descripcion.trim().length < 10}>Abrir incidencia</Boton>
        </div>
      </Modal>
    </>
  );
}
