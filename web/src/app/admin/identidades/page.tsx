"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { VERIFICACION, fechaHora } from "@/lib/admin";
import { Area, Boton, Cargando, Insignia, Modal, Vacio, cn, useAvisar } from "@/components/ui";

type Verif = {
  id: string;
  tienda: string;
  usuario_id: string;
  titular_cuenta: string;
  tipo_documento: string;
  ultimos4: string;
  nombre_completo: string;
  estado: string;
  motivo_rechazo: string;
  creado_en: string;
  revisado_en: string | null;
  numero?: string;
  frente_url?: string;
  reverso_url?: string;
  selfie_url?: string;
};

const MOTIVOS = [
  "La foto del documento está borrosa o cortada.",
  "La selfie no coincide con la foto del documento.",
  "El nombre no coincide con el de la cuenta.",
  "El documento está vencido.",
];

export default function Identidades() {
  const [estado, setEstado] = useState("pendiente");
  const { datos, recargar } = useApi<{ verificaciones: Verif[] }>(`/admin/verificaciones?estado=${estado}`);
  const [abierta, setAbierta] = useState<Verif | null>(null);
  const [rechazo, setRechazo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useAvisar();

  async function abrir(v: Verif) {
    setRechazo(false);
    setMotivo("");
    try {
      setAbierta(await api.get<Verif>(`/admin/verificaciones/${v.id}`));
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }
  async function decidir(accion: "aprobar" | "rechazar") {
    if (!abierta) return;
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/verificaciones/${abierta.id}/${accion}`, accion === "rechazar" ? { motivo } : {});
      avisar(r.mensaje);
      setAbierta(null);
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
        <h1 className="text-[34px] font-extrabold text-pino">Identidades</h1>
        <p className="text-sm text-gris">Compara el documento con la selfie y con el nombre de la cuenta. Sin identidad aprobada no se puede retirar dinero.</p>
      </div>
      <div className="flex w-fit gap-1 rounded-full bg-white p-1 ring-1 ring-linea">
        {[["pendiente", "Por revisar"], ["aprobada", "Aprobadas"], ["rechazada", "Rechazadas"]].map(([k, t]) => (
          <button key={k} onClick={() => setEstado(k)} className={cn("h-9 rounded-full px-4 text-sm font-semibold", estado === k ? "bg-pino text-white" : "text-tinta")}>
            {t}
          </button>
        ))}
      </div>
      {!datos ? (
        <Cargando />
      ) : !datos.verificaciones.length ? (
        <Vacio icono={<BadgeCheck className="size-6" />} titulo="Nada por aquí" detalle={estado === "pendiente" ? "No hay identidades esperando revisión." : "No hay registros en esta lista."} />
      ) : (
        <div className="space-y-3">
          {datos.verificaciones.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
              <div className="min-w-0 flex-1">
                <b className="block text-tinta">{v.nombre_completo}</b>
                <span className="text-sm text-gris">
                  {v.tipo_documento.toUpperCase()} •••• {v.ultimos4} · Cuenta de <Link href={`/admin/vendedoras/${v.usuario_id}`} className="font-semibold hover:text-pino">{v.titular_cuenta}</Link> ({v.tienda})
                </span>
                <span className="block text-xs text-gris">Enviada el {fechaHora(v.creado_en)}{v.motivo_rechazo ? ` · ${v.motivo_rechazo}` : ""}</span>
              </div>
              <Insignia tono={VERIFICACION[v.estado]?.tono ?? "neutro"}>{VERIFICACION[v.estado]?.texto ?? v.estado}</Insignia>
              <Boton variante={v.estado === "pendiente" ? "primario" : "secundario"} tamano="sm" onClick={() => abrir(v)}>
                {v.estado === "pendiente" ? "Revisar" : "Ver"}
              </Boton>
            </div>
          ))}
        </div>
      )}

      <Modal abierto={!!abierta} onCerrar={() => setAbierta(null)} titulo="Revisar identidad" ancho="max-w-3xl">
        {abierta && (
          <div className="space-y-4">
            <dl className="grid grid-cols-[150px_1fr] gap-y-1.5 text-sm">
              <dt className="text-gris">Nombre en documento</dt><dd className="font-semibold text-tinta">{abierta.nombre_completo}</dd>
              <dt className="text-gris">Nombre de la cuenta</dt><dd className="text-tinta">{abierta.titular_cuenta}</dd>
              <dt className="text-gris">Documento</dt><dd className="text-tinta">{abierta.tipo_documento.toUpperCase()} {abierta.numero || `•••• ${abierta.ultimos4}`}</dd>
            </dl>
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Frente", abierta.frente_url], ["Reverso", abierta.reverso_url], ["Selfie", abierta.selfie_url]].map(([t, u]) => (
                <figure key={t}>
                  <figcaption className="mb-1 text-xs font-semibold text-gris">{t}</figcaption>
                  {u ? (
                    <a href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt={t} className="aspect-[4/3] w-full rounded-xl bg-crema object-cover ring-1 ring-linea" />
                    </a>
                  ) : (
                    <div className="grid aspect-[4/3] place-items-center rounded-xl bg-crema text-xs text-gris">No enviado</div>
                  )}
                </figure>
              ))}
            </div>
            <p className="text-xs text-gris">Ver este documento queda registrado en la auditoría.</p>
            {abierta.estado === "pendiente" &&
              (rechazo ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {MOTIVOS.map((m) => (
                      <button key={m} type="button" onClick={() => setMotivo(m)} className={cn("rounded-full px-3 py-1.5 text-xs ring-1", motivo === m ? "bg-pino text-white ring-pino" : "ring-linea")}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo que verá la vendedora" maxLength={300} />
                  <div className="flex justify-end gap-2">
                    <Boton variante="secundario" onClick={() => setRechazo(false)}>Volver</Boton>
                    <Boton variante="peligro" onClick={() => decidir("rechazar")} cargando={enviando} disabled={motivo.trim().length < 5}>Rechazar</Boton>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-2">
                  <Boton variante="peligro" onClick={() => setRechazo(true)}>Rechazar</Boton>
                  <Boton onClick={() => decidir("aprobar")} cargando={enviando}>Aprobar identidad</Boton>
                </div>
              ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
