"use client";

import { useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import type { TiendaAdmin } from "@/lib/admin";
import { Area, Boton, Modal, useAvisar } from "@/components/ui";

// Aprobar, suspender o reactivar una tienda (se usa en la lista y en el detalle).
export function AccionTienda({ t, alTerminar, grande }: { t: TiendaAdmin; alTerminar: () => void; grande?: boolean }) {
  const avisar = useAvisar();
  const [modal, setModal] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function hacer(ruta: string, cuerpo?: unknown) {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/tiendas/${t.id}/${ruta}`, cuerpo);
      avisar(r.mensaje);
      setModal(false);
      setMotivo("");
      alTerminar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const tam = grande ? "md" : "sm";
  return (
    <>
      {t.estado === "revision" ? (
        <span className="flex gap-2">
          {grande && <Boton tamano={tam} variante="secundario" onClick={() => setModal(true)}>Suspender</Boton>}
          <Boton tamano={tam} onClick={() => hacer("aprobar")} cargando={enviando}>{grande ? "Aprobar tienda" : "Aprobar"}</Boton>
        </span>
      ) : t.estado === "suspendida" ? (
        <Boton tamano={tam} variante={grande ? "primario" : "secundario"} onClick={() => hacer("reactivar")} cargando={enviando}>Reactivar</Boton>
      ) : (
        <Boton tamano={tam} variante="secundario" onClick={() => setModal(true)}>Suspender</Boton>
      )}
      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo={`Suspender ${t.nombre}`}>
        <p className="mb-3 text-sm text-gris">La tienda deja de verse y de recibir pedidos. La dueña puede seguir entrando a su cuenta y le avisamos el motivo.</p>
        <Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej. Publica productos prohibidos)" maxLength={300} />
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setModal(false)}>Cancelar</Boton>
          <Boton variante="peligro" onClick={() => hacer("suspender", { motivo })} cargando={enviando} disabled={motivo.trim().length < 5}>Suspender</Boton>
        </div>
      </Modal>
    </>
  );
}
