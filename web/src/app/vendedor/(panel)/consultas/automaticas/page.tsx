"use client";

import Link from "next/link";
import { Bot, ChevronRight } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Boton, Cargando, Interruptor, useAvisar } from "@/components/ui";

type Estado = { activo: boolean; respondidas: number; horario: string; envios: string; politicas: string };

// "Respuestas automáticas": dos opciones, nada más. Responde solo con lo que la tienda ya escribió (sin IA).
export default function RespuestasAutomaticas() {
  const { datos: d, setDatos } = useApi<Estado>("/vendedor/respuestas-automaticas");
  const avisar = useAvisar();
  if (!d) return <Cargando />;

  async function cambiar(activo: boolean) {
    try {
      setDatos(await api.put<Estado>("/vendedor/respuestas-automaticas", { activo }));
      avisar(activo ? "Respuestas automáticas activadas" : "Respuestas automáticas desactivadas");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }

  const ejemplo = d.horario
    ? { q: "¿Hasta qué hora atienden?", r: `Nuestro horario de atención: ${d.horario.replace(/\.$/, "")}.` }
    : d.envios
      ? { q: "¿Hacen envíos a provincia?", r: d.envios }
      : null;

  return (
    <div className="max-w-3xl space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/consultas" className="hover:text-pino">Consultas</Link> <ChevronRight className="size-3.5" /> Respuestas automáticas
      </p>
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Respuestas automáticas</h1>
        <p className="text-sm text-gris">Dos opciones, nada más.</p>
      </div>

      <section className="divide-y divide-linea rounded-[22px] bg-white px-5 py-2 shadow-suave ring-1 ring-linea/60">
        <div className="py-2">
          <Interruptor
            activo={d.activo}
            onChange={cambiar}
            etiqueta="Responder automáticamente las preguntas simples"
            detalle="Responde al instante preguntas de horario, stock, precio, envíos y cambios con la información de tu tienda. No gasta créditos de IA."
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-4 opacity-80">
          <span>
            <span className="block font-semibold">Avisar al cliente cuando envío su pedido</span>
            <span className="block text-sm text-gris">Le llega el código de agencia, los datos del motorizado o el aviso de recojo. Siempre activo.</span>
          </span>
          <span className="relative h-6 w-11 shrink-0 rounded-full bg-pino"><span className="absolute left-[22px] top-0.5 size-5 rounded-full bg-white shadow" /></span>
        </div>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="space-y-3 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
          <h3 className="font-extrabold text-tinta">Así lo ve tu cliente</h3>
          {ejemplo ? (
            <>
              <p className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-crema px-4 py-2.5 text-sm">{ejemplo.q}</p>
              <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-pino-claro px-4 py-2.5 text-sm text-tinta">
                <span className="mb-1 flex items-center gap-1 text-xs font-bold"><Bot className="size-3.5" /> Respuesta automática de la tienda</span>
                {ejemplo.r}
              </div>
              <p className="text-xs text-gris">Siempre se indica que es automática.</p>
            </>
          ) : (
            <p className="text-sm text-gris">Agrega tu horario y tus formas de entrega para ver un ejemplo.</p>
          )}
        </section>
        <section className="space-y-3 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
          <h3 className="font-extrabold text-tinta">Si no sabe la respuesta</h3>
          <p className="text-sm">La pregunta queda <b>por responder</b> y te avisamos a ti. Nunca inventa: solo usa lo que escribiste en tu tienda y en tus productos.</p>
          {d.respondidas > 0 && <p className="text-sm text-gris">Ya respondió sola {d.respondidas} {d.respondidas === 1 ? "pregunta" : "preguntas"}.</p>}
          <Link href="/vendedor/tienda"><Boton variante="secundario" tamano="sm">Revisar la información de tu tienda</Boton></Link>
        </section>
      </div>
    </div>
  );
}
