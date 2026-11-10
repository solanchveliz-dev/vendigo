"use client";

import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { api, ErrorApi } from "@/lib/api";
import { useAvisar } from "@/components/ui";
import { usePanel } from "./contexto";

// Solo en desarrollo: simula lo que haría un comprador mientras su perfil no está listo.
export function PanelDemo() {
  const [abierto, setAbierto] = useState(false);
  const avisar = useAvisar();
  const router = useRouter();
  const { recargarResumen } = usePanel();

  async function hacer(ruta: string, cuerpo: unknown, texto: string, ir?: (r: { id?: string }) => string) {
    try {
      const r = await api.post<{ id?: string }>(ruta, cuerpo);
      avisar(texto);
      recargarResumen();
      router.refresh();
      if (ir) router.push(ir(r));
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }

  return (
    <div className="no-imprimir fixed bottom-24 right-4 z-[250] flex flex-col items-end md:bottom-5 md:right-5">
      {abierto && (
        <div className="mb-2 w-64 space-y-1 rounded-xl bg-white p-2 text-sm shadow-suave ring-1 ring-linea">
          <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-gris">Simular comprador (pruebas)</p>
          {(["agencia", "recojo", "motorizado"] as const).map((e) => (
            <button key={e} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-crema" onClick={() => hacer("/dev/pedido", { entrega: e }, "Llegó un pedido nuevo", (r) => `/vendedor/pedidos/${r.id}`)}>
              Nuevo pedido por {e === "recojo" ? "recojo en tienda" : e}
            </button>
          ))}
          <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-crema" onClick={() => hacer("/dev/pregunta", {}, "Llegó una pregunta nueva")}>
            Nueva pregunta de un cliente
          </button>
          <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-crema" onClick={() => hacer("/dev/barrer", {}, "Se revisaron los envíos de más de 7 días")}>
            Dar por recibidos los envíos de 7 días
          </button>
        </div>
      )}
      <button onClick={() => setAbierto(!abierto)} className="flex size-11 items-center justify-center gap-2 rounded-full bg-tinta text-sm font-semibold text-white shadow-lg md:w-auto md:px-4" aria-label="Pruebas">
        <FlaskConical className="size-4" /> <span className="hidden md:inline">Pruebas</span>
      </button>
    </div>
  );
}
