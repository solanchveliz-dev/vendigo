"use client";

import Link from "next/link";
import { use, useState } from "react";
import { CheckCircle2, ChevronRight, ExternalLink, XCircle } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { ACCIONES, VERIFICACION, fecha, fechaHora, type Evento, type Vendedora } from "@/lib/admin";
import { Area, Boton, Cargando, Insignia, Modal, useAvisar } from "@/components/ui";

type Detalle = {
  vendedora: Vendedora;
  accesos: { exito: boolean; motivo: string; ip: string; agente: string; creado_en: string }[];
  historial: Evento[];
  saldos: { a_liberar: number; disponible: number; retirado: number };
};

const tarjeta = "rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60";

function equipo(ua: string) {
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const so = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return so ? `${nav} en ${so}` : nav;
}

export default function DetalleVendedora({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: d, error, recargar } = useApi<Detalle>(`/admin/vendedores/${id}`);
  const avisar = useAvisar();
  const [modal, setModal] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (error && !d) return <p className="text-sm text-gris">No encontramos esta cuenta.</p>;
  if (!d) return <Cargando />;
  const v = d.vendedora;

  async function suspender() {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/vendedores/${id}/suspender`, { motivo });
      avisar(r.mensaje);
      setModal(false);
      setMotivo("");
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }
  async function reactivar() {
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/vendedores/${id}/reactivar`);
      avisar(r.mensaje);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/admin/vendedoras" className="hover:text-pino">Vendedoras</Link> <ChevronRight className="size-3.5" /> {v.nombre}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-extrabold leading-tight text-pino">{v.nombre}</h1>
          <p className="text-sm text-gris">{v.celular}{v.email ? ` · ${v.email}` : ""} · Registrada el {fecha(v.creado_en)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!v.activo ? <Insignia tono="error">Suspendida</Insignia> : v.bloqueada ? <Insignia tono="aviso">Bloqueo temporal</Insignia> : <Insignia tono="ok">Activa</Insignia>}
            <Insignia tono={VERIFICACION[v.verificacion]?.tono ?? "neutro"}>Identidad: {VERIFICACION[v.verificacion]?.texto ?? v.verificacion}</Insignia>
          </div>
        </div>
        {v.activo ? (
          <Boton variante="peligro" onClick={() => setModal(true)}>Suspender cuenta</Boton>
        ) : (
          <Boton onClick={reactivar}>Reactivar cuenta</Boton>
        )}
      </div>
      {!v.activo && v.suspendido_motivo && <p className="rounded-2xl bg-error-claro px-4 py-3 text-sm text-error"><b>Motivo de la suspensión:</b> {v.suspendido_motivo}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={tarjeta}>
          <h3 className="mb-3 font-bold text-tinta">Tienda</h3>
          {v.tienda ? (
            <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
              <dt className="text-gris">Nombre</dt>
              <dd className="font-semibold text-tinta">
                <a href={`/t/${v.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-pino">{v.tienda} <ExternalLink className="size-3.5" /></a>
              </dd>
              <dt className="text-gris">Plan</dt><dd>{v.plan || "—"}</dd>
              <dt className="text-gris">Pedidos</dt><dd>{v.pedidos}</dd>
              <dt className="text-gris">Ventas cobradas</dt><dd>{soles(v.ventas_centimos)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-gris">Todavía no creó su tienda.</p>
          )}
        </section>
        <section className={tarjeta}>
          <h3 className="mb-3 font-bold text-tinta">Dinero</h3>
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-gris">A liberar</dt><dd>{soles(d.saldos.a_liberar)}</dd>
            <dt className="text-gris">Disponible</dt><dd>{soles(d.saldos.disponible)}</dd>
            <dt className="text-gris">Retirado</dt><dd>{soles(d.saldos.retirado)}</dd>
          </dl>
        </section>
      </div>

      <section className={tarjeta}>
        <h3 className="mb-1 font-bold text-tinta">Accesos recientes</h3>
        <p className="mb-3 text-xs text-gris">Último ingreso correcto: {fechaHora(v.ultimo_acceso)}</p>
        {!d.accesos.length ? (
          <p className="text-sm text-gris">Sin accesos registrados.</p>
        ) : (
          d.accesos.map((a, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-linea py-2 text-sm last:border-0">
              {a.exito ? <CheckCircle2 className="size-4 text-ok" /> : <XCircle className="size-4 text-error" />}
              <span className="flex-1">{a.exito ? "Ingreso correcto" : `Fallido · ${a.motivo}`} <span className="text-xs text-gris">· {equipo(a.agente)}{a.ip ? ` · IP ${a.ip}` : ""}</span></span>
              <span className="text-xs text-gris">{fechaHora(a.creado_en)}</span>
            </div>
          ))
        )}
      </section>

      <section className={tarjeta}>
        <h3 className="mb-3 font-bold text-tinta">Historial de acciones</h3>
        {!d.historial.length ? (
          <p className="text-sm text-gris">Sin acciones registradas.</p>
        ) : (
          d.historial.map((e) => (
            <div key={e.id} className="flex items-center gap-3 border-b border-linea py-2 text-sm last:border-0">
              <span className="flex-1">
                <b className="text-tinta">{ACCIONES[e.accion] ?? e.accion}</b> <span className="text-xs text-gris">· por {e.usuario}{e.rol === "admin" ? " (admin)" : ""}</span>
              </span>
              <span className="text-xs text-gris">{fechaHora(e.creado_en)}</span>
            </div>
          ))
        )}
      </section>

      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo="Suspender cuenta">
        <p className="mb-3 text-sm text-gris">{v.nombre} no podrá entrar a VendiGo y se cerrarán sus sesiones al instante. Su tienda deja de recibir pedidos mientras esté suspendida.</p>
        <Area value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej. Vende productos prohibidos)" maxLength={300} />
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setModal(false)}>Cancelar</Boton>
          <Boton variante="peligro" onClick={suspender} cargando={enviando} disabled={motivo.trim().length < 5}>Suspender</Boton>
        </div>
      </Modal>
    </div>
  );
}
