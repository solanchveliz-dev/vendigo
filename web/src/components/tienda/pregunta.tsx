"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { usuarioActual } from "@/lib/api";
import { Area, Aviso, Boton, Modal } from "@/components/ui";

// "Hacer una pregunta": se publica en el producto con la cuenta de comprador. Si la tienda tiene respuestas
// automáticas y el dato está en su información, se responde al instante; si no, te avisamos cuando responda.
export function BotonPregunta({ productoId }: { productoId: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function abrir() {
    const u = await usuarioActual();
    if (!u) return router.push(`/ingresar?siguiente=${encodeURIComponent(ruta)}`);
    setError("");
    setAbierto(true);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const r = await fetch(`/api/v1/comprador/productos/${productoId}/preguntas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta: texto }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.mensaje ?? "No pudimos publicar tu pregunta. Inténtalo de nuevo.");
      setAbierto(false);
      setTexto("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button onClick={abrir} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-pino font-bold text-white transition hover:bg-pino-2">
        <CircleHelp className="size-5" /> Hacer una pregunta
      </button>
      <Modal abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Pregúntale a la tienda">
        <form onSubmit={enviar} className="space-y-4">
          <Area value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder="Ej. ¿Tienen en otra talla? ¿Hacen envíos a Arequipa?" required />
          <p className="text-xs text-gris">Tu pregunta y la respuesta se verán en esta página con tu primer nombre. No compartas datos personales.</p>
          {error && <Aviso tono="error">{error}</Aviso>}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Boton>
            <Boton type="submit" cargando={enviando} disabled={texto.trim().length < 3}>Publicar pregunta</Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
