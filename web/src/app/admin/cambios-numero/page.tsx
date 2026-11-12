"use client";

import { useEffect, useState } from "react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fechaHora } from "@/lib/admin";
import { Area, Boton, Cargando, Modal, cn, useAvisar } from "@/components/ui";
import { Avatar, Estado, Nota, Titulo } from "@/components/admin/ui";

type Solicitud = {
  id: string;
  nombre: string;
  tienda: string;
  celular_anterior: string;
  celular_nuevo: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  motivo_rechazo: string;
  ip: string;
  creado_en: string;
  revisado_en: string | null;
  frente?: string;
  selfie?: string;
  frente_verificado?: string;
  selfie_verificada?: string;
  nombre_documento?: string;
};

const ESTADOS = { pendiente: ["aviso", "Pendiente"], aprobada: ["ok", "Aprobada"], rechazada: ["error", "Rechazada"] } as const;
const MOTIVOS = [
  "La selfie no coincide con la foto de su verificación.",
  "La foto del documento está borrosa o cortada.",
  "El documento no es el mismo que verificó.",
];

// Solicitudes de vendedoras que perdieron su número. Solo llegan aquí si el DNI escrito coincide con su
// verificación aprobada; el admin compara las fotos nuevas con las de esa verificación antes de aprobar.
export default function CambiosNumero() {
  const [estado, setEstado] = useState("pendiente");
  const { datos, recargar } = useApi<{ solicitudes: Solicitud[] }>(`/admin/cambios-numero?estado=${estado}`);
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <>
      <Titulo titulo="Cambios de número" detalle="Vendedoras que perdieron su celular y piden usar uno nuevo." />
      <Nota>
        Al aprobar cambiamos el número, cerramos todas sus sesiones y quitamos su app de autenticación. Le avisamos por SMS al número nuevo para que cree una contraseña.
      </Nota>
      <section className="mt-5 overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
        <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
            <option value="pendiente">Pendientes</option>
            <option value="aprobada">Aprobadas</option>
            <option value="rechazada">Rechazadas</option>
            <option value="todas">Todas</option>
          </select>
          <span className="ml-auto text-sm text-gris">{datos?.solicitudes.length ?? 0} registros</span>
        </div>
        {!datos ? (
          <Cargando />
        ) : !datos.solicitudes.length ? (
          <p className="p-6 text-sm text-gris">No hay solicitudes con ese filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                  <th className="px-5 py-3.5">Vendedora</th>
                  <th className="px-5 py-3.5">Número anterior</th>
                  <th className="px-5 py-3.5">Número nuevo</th>
                  <th className="px-5 py-3.5">Enviada</th>
                  <th className="px-5 py-3.5">Estado</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {datos.solicitudes.map((s) => (
                  <tr key={s.id} className="border-b border-linea last:border-0 hover:bg-crema/40">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-3">
                        <Avatar nombre={s.nombre} />
                        <span>
                          <b className="block text-tinta">{s.nombre}</b>
                          <span className="text-xs text-gris">{s.tienda || "Sin tienda"}</span>
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-tinta">{s.celular_anterior}</td>
                    <td className="px-5 py-3.5 font-semibold text-tinta">{s.celular_nuevo}</td>
                    <td className="px-5 py-3.5 text-gris">{fechaHora(s.creado_en)}</td>
                    <td className="px-5 py-3.5"><Estado tono={ESTADOS[s.estado][0]}>{ESTADOS[s.estado][1]}</Estado></td>
                    <td className="px-5 py-3.5 text-right">
                      <Boton variante="secundario" tamano="sm" onClick={() => setAbierta(s.id)}>{s.estado === "pendiente" ? "Revisar" : "Ver"}</Boton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {abierta && <Revisar id={abierta} onCerrar={() => setAbierta(null)} alTerminar={recargar} />}
    </>
  );
}

function Revisar({ id, onCerrar, alTerminar }: { id: string; onCerrar: () => void; alTerminar: () => void }) {
  const [s, setS] = useState<Solicitud | null>(null);
  const [rechazo, setRechazo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useAvisar();

  useEffect(() => {
    api.get<Solicitud>(`/admin/cambios-numero/${id}`).then(setS).catch((e) => avisar((e as ErrorApi).message, "error"));
  }, [id, avisar]);

  async function decidir(accion: "aprobar" | "rechazar") {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/cambios-numero/${id}/${accion}`, accion === "rechazar" ? { motivo } : {});
      avisar(r.mensaje);
      onCerrar();
      alTerminar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const fotos: [string, string | undefined][] = s
    ? [
        ["DNI enviado ahora", s.frente],
        ["Selfie enviada ahora", s.selfie],
        ["DNI de su verificación", s.frente_verificado],
        ["Selfie de su verificación", s.selfie_verificada],
      ]
    : [];

  return (
    <Modal abierto onCerrar={onCerrar} titulo="Revisar cambio de número" ancho="max-w-3xl">
      {!s ? (
        <p className="text-sm text-gris">Cargando…</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-[170px_1fr] gap-y-1.5 text-sm">
            <dt className="text-gris">Nombre de la cuenta</dt><dd className="font-semibold text-tinta">{s.nombre}</dd>
            <dt className="text-gris">Nombre en su DNI</dt><dd className="text-tinta">{s.nombre_documento || "—"}</dd>
            <dt className="text-gris">Número anterior</dt><dd className="text-tinta">{s.celular_anterior}</dd>
            <dt className="text-gris">Número nuevo</dt><dd className="font-semibold text-tinta">{s.celular_nuevo}</dd>
            <dt className="text-gris">Enviada</dt><dd className="text-tinta">{fechaHora(s.creado_en)}{s.ip ? ` · IP ${s.ip}` : ""}</dd>
            {s.motivo_rechazo && (<><dt className="text-gris">Motivo del rechazo</dt><dd className="text-error">{s.motivo_rechazo}</dd></>)}
          </dl>
          <div className="grid gap-3 sm:grid-cols-2">
            {fotos.map(([t, u]) => (
              <figure key={t}>
                <figcaption className="mb-1 text-xs font-semibold text-gris">{t}</figcaption>
                {u ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={u} target="_blank" rel="noreferrer"><img src={u} alt={t} className="aspect-[4/3] w-full rounded-xl bg-crema object-cover ring-1 ring-linea" /></a>
                ) : (
                  <div className="grid aspect-[4/3] place-items-center rounded-xl bg-crema text-xs text-gris">No disponible</div>
                )}
              </figure>
            ))}
          </div>
          <p className="text-xs text-gris">El DNI escrito ya coincide con el de su verificación. Ver estas fotos queda registrado en la auditoría.</p>
          {s.estado === "pendiente" &&
            (rechazo ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {MOTIVOS.map((m) => (
                    <button key={m} type="button" onClick={() => setMotivo(m)} className={cn("rounded-full px-3 py-1.5 text-xs ring-1", motivo === m ? "bg-pino text-white ring-pino" : "ring-linea")}>{m}</button>
                  ))}
                </div>
                <Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (se le envía por SMS)" maxLength={300} />
                <div className="flex justify-end gap-2">
                  <Boton variante="secundario" onClick={() => setRechazo(false)}>Volver</Boton>
                  <Boton variante="peligro" onClick={() => decidir("rechazar")} cargando={enviando} disabled={motivo.trim().length < 5}>Rechazar</Boton>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <Boton variante="secundario" onClick={() => setRechazo(true)}>Rechazar</Boton>
                <Boton onClick={() => decidir("aprobar")} cargando={enviando}>Aprobar cambio</Boton>
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
}
