"use client";

import { useState } from "react";
import { MessageCircleQuestion, Send } from "lucide-react";
import { api, ErrorApi } from "@/lib/api";
import { hace } from "@/lib/formato";
import type { Ayuda } from "@/lib/tipos";
import { Boton, Entrada, Insignia, cn, useAvisar } from "@/components/ui";

const SUGERIDAS = ["¡Claro! Lo cambio y te aviso", "Sale hoy mismo", "Ya está en la agencia, revisa tu código", "Coordinemos el cambio sin costo"];

// Tarjeta de "Ayuda con mi pedido": el cliente escribe en su pedido y la tienda responde aquí.
export function TarjetaAyuda({ ayuda, alResponder }: { ayuda: Ayuda; alResponder: () => void }) {
  const avisar = useAvisar();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const nombre = ayuda.comprador.split(" ")[0];

  async function responder(t: string) {
    if (t.trim().length < 2) return;
    setEnviando(true);
    try {
      await api.post(`/vendedor/ayudas/${ayuda.id}/responder`, { texto: t.trim() });
      setTexto("");
      avisar("Respondido. Tu cliente lo ve en su pedido.");
      alResponder();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-extrabold text-tinta">
          <MessageCircleQuestion className="size-[18px]" /> {ayuda.motivo}
        </h3>
        <Insignia tono={ayuda.abierta ? "aviso" : "pino"}>{ayuda.abierta ? "Por responder" : "Resuelta"}</Insignia>
      </div>
      <div className="mt-3 space-y-2">
        {ayuda.mensajes.map((m, i) => (
          <div key={i} className={cn("max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm", m.autor === "tienda" ? "ml-auto bg-pino text-white" : "bg-crema text-tinta")}>
            <b className="block text-xs opacity-80">{m.autor === "tienda" ? "Tú" : nombre}</b>
            {m.texto}
            <span className="block text-[11px] opacity-70">{hace(m.creado_en)}</span>
          </div>
        ))}
      </div>
      {ayuda.abierta && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGERIDAS.map((s) => (
              <button key={s} type="button" onClick={() => setTexto(s)} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-tinta ring-1 ring-linea hover:bg-crema">
                {s}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Entrada value={texto} maxLength={300} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe una respuesta" onKeyDown={(e) => e.key === "Enter" && responder(texto)} />
            <Boton onClick={() => responder(texto)} cargando={enviando} disabled={texto.trim().length < 2}>
              <Send className="size-4" /> Responder
            </Boton>
          </div>
        </>
      )}
    </div>
  );
}
