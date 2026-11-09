"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { fechaHora } from "@/lib/admin";
import { Area, Boton, Cargando, Insignia, Modal, Vacio, cn, useAvisar } from "@/components/ui";

type Reclamo = {
  id: string;
  codigo: string;
  tienda: string;
  comprador: string;
  total_centimos: number;
  motivo: string;
  descripcion: string;
  fotos: string[];
  respuesta_vendedor: string;
  evidencias: string[];
  estado: string;
  nota_admin: string;
  creado_en: string;
  respondido_en: string | null;
  resuelto_en: string | null;
  liberado: boolean;
};

const MOTIVOS: Record<string, string> = { no_llego: "No llegó", danado: "Llegó dañado", distinto: "Es distinto a lo publicado", incompleto: "Llegó incompleto", otro: "Otro" };
const ESTADOS: Record<string, { t: string; tono: "aviso" | "pino" | "ok" | "error" }> = {
  abierto: { t: "Esperando a la tienda", tono: "aviso" },
  en_revision: { t: "Por decidir", tono: "pino" },
  a_favor_comprador: { t: "A favor del comprador", tono: "error" },
  a_favor_vendedor: { t: "A favor de la tienda", tono: "ok" },
};

function Fotos({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <a key={i} href={u} target="_blank" rel="noreferrer">
          <img src={u} alt="" className="size-20 rounded-xl bg-crema object-cover ring-1 ring-linea" />
        </a>
      ))}
    </div>
  );
}

export default function Reclamos() {
  const [todos, setTodos] = useState(false);
  const { datos, recargar } = useApi<{ reclamos: Reclamo[] }>(`/admin/reclamos?estado=${todos ? "todos" : "abiertos"}`);
  const [decidir, setDecidir] = useState<{ c: Reclamo; aFavor: "comprador" | "vendedor" } | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useAvisar();

  async function confirmar() {
    if (!decidir) return;
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/reclamos/${decidir.c.id}/resolver`, { a_favor: decidir.aFavor, nota });
      avisar(r.mensaje);
      setDecidir(null);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold text-pino">Reclamos</h1>
        <p className="text-sm text-gris">Cuando la tienda y el comprador no se ponen de acuerdo, decides con las pruebas de ambos.</p>
      </div>
      <div className="flex w-fit gap-1 rounded-full bg-white p-1 ring-1 ring-linea">
        {[[false, "Abiertos"], [true, "Todos"]].map(([k, t]) => (
          <button key={String(k)} onClick={() => setTodos(k as boolean)} className={cn("h-9 rounded-full px-4 text-sm font-semibold", todos === k ? "bg-pino text-white" : "text-tinta")}>
            {t as string}
          </button>
        ))}
      </div>
      {!datos ? (
        <Cargando />
      ) : !datos.reclamos.length ? (
        <Vacio icono={<ShieldAlert className="size-6" />} titulo="Sin reclamos" detalle="No hay reclamos en esta lista." />
      ) : (
        <div className="space-y-4">
          {datos.reclamos.map((c) => {
            const abierto = c.estado === "abierto" || c.estado === "en_revision";
            return (
              <article key={c.id} className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <b className="text-lg text-tinta">{c.codigo}</b> <span className="text-sm text-gris">· {c.tienda} · {soles(c.total_centimos)}</span>
                    <p className="text-xs text-gris">Abierto el {fechaHora(c.creado_en)}</p>
                  </div>
                  <Insignia tono={ESTADOS[c.estado]?.tono ?? "aviso"}>{ESTADOS[c.estado]?.t ?? c.estado}</Insignia>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-crema/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gris">Comprador · {c.comprador}</p>
                    <b className="mt-1 block text-tinta">{MOTIVOS[c.motivo] ?? c.motivo}</b>
                    <p className="text-sm text-tinta">{c.descripcion || "Sin descripción."}</p>
                    <Fotos urls={c.fotos} />
                  </div>
                  <div className="rounded-2xl bg-crema/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gris">Tienda {c.respondido_en ? `· respondió el ${fechaHora(c.respondido_en)}` : ""}</p>
                    <p className="mt-1 text-sm text-tinta">{c.respuesta_vendedor || "Todavía no responde."}</p>
                    <Fotos urls={c.evidencias} />
                  </div>
                </div>
                {c.nota_admin && <p className="mt-3 text-sm text-gris"><b className="text-tinta">Decisión:</b> {c.nota_admin}</p>}
                {abierto && (
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Boton variante="secundario" tamano="sm" onClick={() => { setNota(""); setDecidir({ c, aFavor: "vendedor" }); }}>A favor de la tienda</Boton>
                    <Boton variante="peligro" tamano="sm" onClick={() => { setNota(""); setDecidir({ c, aFavor: "comprador" }); }} disabled={c.liberado}>
                      A favor del comprador
                    </Boton>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Modal abierto={!!decidir} onCerrar={() => setDecidir(null)} titulo={decidir?.aFavor === "comprador" ? "Resolver a favor del comprador" : "Resolver a favor de la tienda"}>
        {decidir && (
          <div className="space-y-4">
            <p className="text-sm text-gris">
              {decidir.aFavor === "comprador"
                ? `Se devuelven ${soles(decidir.c.total_centimos)} al comprador y el pedido ${decidir.c.codigo} se cancela.`
                : `El pedido ${decidir.c.codigo} queda como entregado y el dinero se libera a la tienda en la fecha prevista.`}
            </p>
            <Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Explica la decisión (la verán la tienda y el comprador)" maxLength={500} />
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setDecidir(null)}>Cancelar</Boton>
              <Boton variante={decidir.aFavor === "comprador" ? "peligro" : "primario"} onClick={confirmar} cargando={enviando} disabled={nota.trim().length < 10}>
                Confirmar decisión
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
