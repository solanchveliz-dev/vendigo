"use client";

import { useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import type { ProductoAdmin } from "@/lib/admin";
import { Area, Boton, Modal, useAvisar } from "@/components/ui";

// Retirar una publicación (con motivo que ve la vendedora) o volver a habilitarla.
export function AccionProducto({ p, alTerminar }: { p: ProductoAdmin; alTerminar: () => void }) {
  const avisar = useAvisar();
  const [modal, setModal] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function hacer(ruta: string, cuerpo?: unknown) {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/productos/${p.id}/${ruta}`, cuerpo);
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

  return (
    <>
      {p.estado === "retirado" ? (
        <Boton onClick={() => hacer("restaurar")} cargando={enviando}>Habilitar publicación</Boton>
      ) : (
        <Boton variante="peligro" className="!bg-error !text-white !ring-0 hover:!bg-error/90" onClick={() => setModal(true)}>Retirar publicación</Boton>
      )}
      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo="Retirar publicación">
        <p className="mb-3 text-sm text-gris">
          “{p.nombre}” deja de verse en {p.tienda}. La vendedora recibe el motivo y no podrá volver a publicarlo hasta que lo habilites.
        </p>
        <Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej. Producto prohibido o imágenes de otra marca)" maxLength={300} />
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setModal(false)}>Cancelar</Boton>
          <Boton variante="peligro" onClick={() => hacer("retirar", { motivo })} cargando={enviando} disabled={motivo.trim().length < 5}>Retirar</Boton>
        </div>
      </Modal>
    </>
  );
}
