"use client";

import { useEffect, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import { Area, Boton, Modal, cn, useAvisar } from "@/components/ui";

type Verif = {
  id: string;
  titular_cuenta: string;
  tipo_documento: string;
  clase?: "identidad" | "negocio";
  ultimos4: string;
  nombre_completo: string;
  estado: string;
  numero?: string;
  frente_url?: string;
  reverso_url?: string;
  selfie_url?: string;
};

const MOTIVOS_RUC = [
  "La ficha RUC está borrosa o incompleta.",
  "El RUC no figura activo o habido en SUNAT.",
  "La razón social no coincide con la ficha RUC.",
  "El RUC no pertenece a la dueña de la tienda.",
];

const MOTIVOS = [
  "La foto del documento está borrosa o cortada.",
  "La selfie no coincide con la foto del documento.",
  "El nombre no coincide con el de la cuenta.",
  "El documento está vencido.",
];

// Revisión de identidad (DNI/CE: compara el documento con la selfie y con el nombre de la cuenta)
// o de RUC (compara la ficha RUC con SUNAT y con la razón social escrita).
export function RevisarIdentidad({ id, abierto, onCerrar, alTerminar }: { id: string; abierto: boolean; onCerrar: () => void; alTerminar: () => void }) {
  const [v, setV] = useState<Verif | null>(null);
  const [rechazo, setRechazo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useAvisar();

  useEffect(() => {
    if (!abierto) return;
    setRechazo(false);
    setMotivo("");
    api.get<Verif>(`/admin/verificaciones/${id}`).then(setV).catch((e) => avisar((e as ErrorApi).message, "error"));
  }, [abierto, id, avisar]);

  async function decidir(accion: "aprobar" | "rechazar") {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/verificaciones/${id}/${accion}`, accion === "rechazar" ? { motivo } : {});
      avisar(r.mensaje);
      onCerrar();
      alTerminar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={v?.clase === "negocio" ? "Revisar RUC" : "Revisar identidad"} ancho="max-w-3xl">
      {!v ? (
        <p className="text-sm text-gris">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-[170px_1fr] gap-y-1.5 text-sm">
            <dt className="text-gris">{v.clase === "negocio" ? "Razón social" : "Nombre en el documento"}</dt><dd className="font-semibold text-tinta">{v.nombre_completo}</dd>
            <dt className="text-gris">Nombre de la cuenta</dt><dd className="text-tinta">{v.titular_cuenta}</dd>
            <dt className="text-gris">Documento</dt><dd className="text-tinta">{v.tipo_documento.toUpperCase()} {v.numero || `•••• ${v.ultimos4}`}</dd>
          </dl>
          <div className="grid gap-3 sm:grid-cols-3">
            {(v.clase === "negocio" ? ([["Ficha RUC", v.frente_url]] as const) : ([["Frente", v.frente_url], ["Reverso", v.reverso_url], ["Selfie", v.selfie_url]] as const)).map(([t, u]) => (
              <figure key={t}>
                <figcaption className="mb-1 text-xs font-semibold text-gris">{t}</figcaption>
                {u ? (
                  <a href={u} target="_blank" rel="noreferrer"><img src={u} alt={t} className="aspect-[4/3] w-full rounded-xl bg-crema object-cover ring-1 ring-linea" /></a>
                ) : (
                  <div className="grid aspect-[4/3] place-items-center rounded-xl bg-crema text-xs text-gris">No enviado</div>
                )}
              </figure>
            ))}
          </div>
          {v.clase === "negocio" && (
            <p className="rounded-xl bg-crema px-3 py-2 text-xs text-tinta">
              Consulta el RUC en SUNAT (estado <b>Activo</b> y condición <b>Habido</b>) y confirma que la razón social coincida antes de aprobar.
            </p>
          )}
          <p className="text-xs text-gris">Ver este documento queda registrado en la auditoría.</p>
          {v.estado === "pendiente" &&
            (rechazo ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(v.clase === "negocio" ? MOTIVOS_RUC : MOTIVOS).map((m) => (
                    <button key={m} type="button" onClick={() => setMotivo(m)} className={cn("rounded-full px-3 py-1.5 text-xs ring-1", motivo === m ? "bg-pino text-white ring-pino" : "ring-linea")}>{m}</button>
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
                <Boton variante="secundario" onClick={() => setRechazo(true)}>Rechazar</Boton>
                <Boton onClick={() => decidir("aprobar")} cargando={enviando}>{v.clase === "negocio" ? "Aprobar RUC" : "Aprobar identidad"}</Boton>
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}
