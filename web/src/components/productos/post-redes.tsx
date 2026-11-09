"use client";

import { useState } from "react";
import { Copy, Loader2, Share2, Sparkles } from "lucide-react";
import { api, ErrorApi } from "@/lib/api";
import { Area, Boton, Modal, cn, useAvisar } from "@/components/ui";

const REDES = [
  ["instagram", "Instagram"],
  ["tiktok", "TikTok"],
  ["whatsapp", "Estado de WhatsApp"],
] as const;

// "Crear post para redes con IA": 1 crédito por las 3 versiones; cambiar de red no gasta.
export function PostRedes({ productoId, creditos, alUsar }: { productoId: string; creditos?: number; alUsar?: () => void }) {
  const avisar = useAvisar();
  const [cargando, setCargando] = useState(false);
  const [textos, setTextos] = useState<Record<string, string> | null>(null);
  const [red, setRed] = useState<string>("instagram");

  async function crear() {
    setCargando(true);
    try {
      const r = await api.post<{ textos: Record<string, string> }>("/vendedor/ia/crear-post", { producto_id: productoId, red: "instagram" });
      setTextos(r.textos);
      setRed("instagram");
      alUsar?.();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setCargando(false);
    }
  }

  async function copiar() {
    if (!textos) return;
    await navigator.clipboard.writeText(textos[red]);
    avisar("Copiado. Pégalo en tu red social");
  }

  return (
    <>
      <div className="mb-5 flex items-center gap-4 rounded-2xl border border-dashed border-coral/60 bg-coral-claro/70 px-4 py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-coral"><Share2 className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-sm text-tinta">Crear post para redes con IA</b>
          <span className="text-xs text-gris">
            Texto listo para Instagram, TikTok o WhatsApp con el link de tu tienda · 1 crédito{creditos !== undefined ? ` (te quedan ${creditos})` : ""}
          </span>
        </span>
        <Boton tamano="sm" onClick={crear} disabled={cargando}>
          {cargando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Crear post
        </Boton>
      </div>

      <Modal abierto={!!textos} onCerrar={() => setTextos(null)} titulo="Tu post está listo">
        {textos && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              {REDES.map(([k, n]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRed(k)}
                  className={cn("rounded-full px-4 py-2 text-sm font-semibold transition", red === k ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea")}
                >
                  {n}
                </button>
              ))}
            </div>
            <Area rows={7} value={textos[red]} onChange={(e) => setTextos({ ...textos, [red]: e.target.value })} />
            <p className="mb-3 mt-1.5 text-xs text-gris">Puedes editarlo. Cambiar de red no gasta créditos.</p>
            <Boton bloque onClick={copiar}><Copy className="size-4" /> Copiar texto</Boton>
          </>
        )}
      </Modal>
    </>
  );
}
