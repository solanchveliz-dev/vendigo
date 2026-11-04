"use client";

import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { hace } from "@/lib/formato";
import { Boton, Cargando, Chips, Encabezado, Area, Tarjeta, Vacio, useAvisar } from "@/components/ui";
import { usePanel } from "@/components/panel/contexto";

type Pregunta = { id: string; producto: string; autor: string; pregunta: string; respuesta: string | null; respondida_en: string | null; creado_en: string };

export default function Consultas() {
  const [estado, setEstado] = useState<"pendientes" | "respondidas">("pendientes");
  const { datos, recargar, cargando } = useApi<{ preguntas: Pregunta[]; pendientes: number }>(`/vendedor/preguntas?estado=${estado}`);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const avisar = useAvisar();
  const { recargarResumen } = usePanel();

  async function responder(id: string) {
    try {
      await api.post(`/vendedor/preguntas/${id}/responder`, { respuesta: textos[id] ?? "" });
      avisar("Respuesta publicada en el producto.");
      recargar();
      recargarResumen();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }

  return (
    <>
      <Encabezado titulo="Consultas" detalle="Preguntas públicas que hacen los clientes en tus productos. Tu respuesta la ven todos." />
      <div className="mb-4">
        <Chips
          opciones={[
            { valor: "pendientes" as const, texto: "Por responder", n: datos?.pendientes },
            { valor: "respondidas" as const, texto: "Respondidas" },
          ]}
          valor={estado}
          onChange={setEstado}
        />
      </div>
      {cargando && !datos ? (
        <Cargando />
      ) : !datos?.preguntas.length ? (
        <Vacio icono={<MessageCircleQuestion className="size-6" />} titulo={estado === "pendientes" ? "No tienes preguntas por responder" : "Aún no respondes preguntas"} />
      ) : (
        <div className="space-y-3">
          {datos.preguntas.map((q) => (
            <Tarjeta key={q.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gris">{q.producto}</p>
              <p className="mt-1 font-semibold">“{q.pregunta}”</p>
              <p className="text-sm text-gris">
                {q.autor} · {hace(q.creado_en)}
              </p>
              {q.respuesta ? (
                <p className="mt-3 rounded-xl bg-pino-claro px-4 py-3 text-sm text-pino">{q.respuesta}</p>
              ) : (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Area value={textos[q.id] ?? ""} onChange={(e) => setTextos({ ...textos, [q.id]: e.target.value })} placeholder="Escribe tu respuesta" className="min-h-11" rows={1} />
                  <Boton onClick={() => responder(q.id)} disabled={(textos[q.id] ?? "").trim().length < 2}>
                    Responder
                  </Boton>
                </div>
              )}
            </Tarjeta>
          ))}
        </div>
      )}
    </>
  );
}
