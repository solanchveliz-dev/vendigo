"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Bot, ChevronRight, CircleHelp, MessageCircleQuestion, ReceiptText, Reply, Zap } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { hace } from "@/lib/formato";
import type { Ayuda } from "@/lib/tipos";
import { Area, Boton, Cargando, Insignia, Vacio, cn, useAvisar } from "@/components/ui";
import { usePanel } from "@/components/panel/contexto";
import { TarjetaAyuda } from "@/components/pedidos/ayuda";

type Pregunta = {
  id: string;
  producto: string;
  imagen_url: string;
  autor: string;
  pregunta: string;
  respuesta: string | null;
  automatica: boolean;
  respondida_en: string | null;
  creado_en: string;
};
type Rapida = { id: string; titulo: string; texto: string };

function Indicador({ titulo, valor, detalle, icono, oscuro }: { titulo: string; valor: number; detalle: string; icono: React.ReactNode; oscuro?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[22px] p-5 shadow-suave ring-1", oscuro ? "bg-pino text-white ring-pino" : "bg-white ring-linea/60")}>
      <div className="flex items-start justify-between">
        <p className={cn("text-sm", oscuro ? "text-white/80" : "text-gris")}>{titulo}</p>
        <span className={cn("grid size-9 place-items-center rounded-xl", oscuro ? "bg-white/10 text-coral" : "bg-crema text-tinta")}>{icono}</span>
      </div>
      <p className="mt-3 font-display text-3xl font-extrabold">{valor}</p>
      <p className={cn("mt-1 text-xs font-semibold", oscuro ? "text-white/80" : "text-tinta")}>{detalle}</p>
      {oscuro && <div className="absolute -bottom-10 -right-6 size-24 rounded-full bg-white/10" />}
    </div>
  );
}

function Contenido() {
  const params = useSearchParams();
  const [pestana, setPestana] = useState<"preguntas" | "ayuda">(params.get("tab") === "ayuda" ? "ayuda" : "preguntas");
  const preguntas = useApi<{ preguntas: Pregunta[]; pendientes: number; automaticas: number }>("/vendedor/preguntas?estado=todas");
  const ayudas = useApi<{ ayudas: Ayuda[]; abiertas: number }>("/vendedor/ayudas");
  const rapidas = useApi<{ respuestas: Rapida[] }>("/vendedor/respuestas-rapidas");
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState("");
  const avisar = useAvisar();
  const { recargarResumen } = usePanel();

  async function responder(id: string) {
    setEnviando(id);
    try {
      await api.post(`/vendedor/preguntas/${id}/responder`, { respuesta: textos[id] ?? "" });
      avisar("Publicada. La ven todos los que miran el producto.");
      preguntas.recargar();
      recargarResumen();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando("");
    }
  }

  if (!preguntas.datos || !ayudas.datos) return <Cargando />;
  const q = preguntas.datos;
  const a = ayudas.datos;

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor" className="hover:text-pino">Inicio</Link> <ChevronRight className="size-3.5" /> Consultas
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
          <h1 className="text-[34px] font-extrabold leading-tight text-pino">Consultas</h1>
          <p className="text-sm text-gris">Sin chat: las preguntas se responden una vez en el producto y la ayuda va dentro de cada pedido.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/vendedor/consultas/respuestas"><Boton variante="secundario"><Reply className="size-4" /> Respuestas rápidas</Boton></Link>
          <Link href="/vendedor/consultas/automaticas"><Boton variante="secundario"><Bot className="size-4" /> Respuestas automáticas</Boton></Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Indicador titulo="Preguntas por responder" valor={q.pendientes} detalle="Quedan publicadas en el producto" icono={<CircleHelp className="size-[18px]" />} />
        <Indicador oscuro titulo="Respondidas solas" valor={q.automaticas} detalle="Con la información de tu tienda" icono={<Zap className="size-[18px]" />} />
        <Indicador titulo="Ayuda con pedidos" valor={a.abiertas} detalle="Pendientes de respuesta" icono={<ReceiptText className="size-[18px]" />} />
      </div>

      <div className="inline-flex rounded-full bg-white p-1 ring-1 ring-linea">
        {([["preguntas", `Preguntas${q.pendientes ? ` (${q.pendientes})` : ""}`], ["ayuda", `Ayuda con pedidos${a.abiertas ? ` (${a.abiertas})` : ""}`]] as const).map(([k, t]) => (
          <button key={k} onClick={() => setPestana(k)} className={cn("rounded-full px-4 py-2 text-sm font-semibold transition", pestana === k ? "bg-pino text-white" : "text-tinta hover:bg-crema")}>
            {t}
          </button>
        ))}
      </div>

      {pestana === "preguntas" ? (
        !q.preguntas.length ? (
          <Vacio icono={<MessageCircleQuestion className="size-6" />} titulo="Sin preguntas" detalle="Cuando alguien pregunte por un producto, aparece aquí." />
        ) : (
          <div className="space-y-4">
            {q.preguntas.map((p) => (
              <div key={p.id} className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
                <div className="flex items-center gap-3">
                  <span className="size-11 shrink-0 overflow-hidden rounded-xl bg-arena">{p.imagen_url && <img src={p.imagen_url} alt="" className="size-full object-cover" />}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-tinta">{p.producto}</p>
                    <p className="text-sm text-gris">{p.autor && `${p.autor} · `}{hace(p.creado_en)}</p>
                  </div>
                  {p.respuesta ? (
                    p.automatica ? <span className="text-xs font-bold text-tinta">Automática</span> : <Insignia tono="pino">Respondida</Insignia>
                  ) : (
                    <Insignia tono="aviso">Por responder</Insignia>
                  )}
                </div>
                <p className="mt-3 font-bold text-tinta">{p.pregunta}</p>
                {p.respuesta ? (
                  <p className="mt-1 text-sm text-gris">{p.respuesta}</p>
                ) : (
                  <>
                    {!!rapidas.datos?.respuestas.length && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {rapidas.datos.respuestas.slice(0, 4).map((r) => (
                          <button key={r.id} type="button" onClick={() => setTextos({ ...textos, [p.id]: r.texto })} className="rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-tinta ring-1 ring-linea hover:bg-crema">
                            {r.titulo}
                          </button>
                        ))}
                      </div>
                    )}
                    <Area className="mt-2" rows={3} maxLength={500} value={textos[p.id] ?? ""} onChange={(e) => setTextos({ ...textos, [p.id]: e.target.value })} placeholder="Tu respuesta (la verán todos los que miren el producto)" />
                    <Boton className="mt-3" cargando={enviando === p.id} disabled={(textos[p.id] ?? "").trim().length < 2} onClick={() => responder(p.id)}>
                      Publicar respuesta
                    </Boton>
                  </>
                )}
              </div>
            ))}
          </div>
        )
      ) : !a.ayudas.length ? (
        <Vacio icono={<ReceiptText className="size-6" />} titulo="Nadie necesita ayuda" detalle="Cuando un cliente pida ayuda con su pedido, aparece aquí." />
      ) : (
        <div className="space-y-5">
          {a.ayudas.map((x) => (
            <div key={x.id}>
              <div className="mb-1.5 flex justify-between text-sm text-gris">
                <span>{x.comprador} · {x.codigo}</span>
                <Link href={`/vendedor/pedidos/${x.pedido_id}`} className="font-semibold text-pino">Ver pedido</Link>
              </div>
              <TarjetaAyuda ayuda={x} alResponder={() => { ayudas.recargar(); recargarResumen(); }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Consultas() {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido />
    </Suspense>
  );
}
