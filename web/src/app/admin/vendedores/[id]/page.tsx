"use client";

import Link from "next/link";
import { use, useState } from "react";
import { BadgeCheck, CheckCircle2, ChevronRight, Crown, Flag, ShoppingBag, Star, XCircle } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { ACCIONES, VERIFICACION, estadoVendedora, fecha, fechaHora, type Evento, type Vendedora } from "@/lib/admin";
import { Area, Boton, Cargando, Modal, useAvisar } from "@/components/ui";
import { Estado, Indicador, Tarjeta, Titulo, useExportar } from "@/components/admin/ui";
import { RevisarIdentidad } from "@/components/admin/revisar-identidad";

type Detalle = {
  vendedora: Vendedora;
  accesos: { exito: boolean; motivo: string; ip: string; agente: string; creado_en: string }[];
  historial: Evento[];
  saldos: { a_liberar: number; disponible: number; retirado: number };
  tienda: { ciudad: string; entrega: string[]; reputacion: string; reclamos: number; reclamos_perdidos: number; plan_desde: string | null; verificacion_id: string };
  pagos_plan: { concepto: string; monto_centimos: number; creado_en: string }[];
};

const REPUTACION: Record<string, { t: string; d: string }> = {
  nueva: { t: "Tienda nueva", d: "Su dinero se libera 5 días después de la entrega" },
  buena: { t: "Buena", d: "Su dinero se libera 2 días después de la entrega" },
  excelente: { t: "Excelente", d: "Su dinero se libera apenas Culqi abona" },
};

function equipo(ua: string) {
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const so = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return so ? `${nav} en ${so}` : nav;
}

function Fila({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-3 py-1.5 text-[15px]">
      <dt className="text-gris">{k}</dt>
      <dd className="text-tinta">{children}</dd>
    </div>
  );
}

export default function DetalleVendedor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: d, error, recargar } = useApi<Detalle>(`/admin/vendedores/${id}`);
  const avisar = useAvisar();
  const [suspender, setSuspender] = useState(false);
  const [revisar, setRevisar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  useExportar("vendedor", () =>
    d ? [["Campo", "Valor"], ["Nombre", d.vendedora.nombre], ["Correo", d.vendedora.email], ["Celular", d.vendedora.celular], ["Tienda", d.vendedora.tienda], ["Plan", d.vendedora.plan], ["Pedidos", d.vendedora.pedidos], ["Ventas (S/)", (d.vendedora.ventas_centimos / 100).toFixed(2)], [], ["Pagos de suscripción"], ...d.pagos_plan.map((p) => [p.creado_en.slice(0, 10), p.concepto, (p.monto_centimos / 100).toFixed(2)])] : [],
  );

  if (error && !d) return <p className="text-sm text-gris">No encontramos esta cuenta.</p>;
  if (!d) return <Cargando />;
  const v = d.vendedora;
  const e = estadoVendedora(v);
  const rep = REPUTACION[d.tienda.reputacion];

  async function confirmarSuspension() {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/vendedores/${id}/suspender`, { motivo });
      avisar(r.mensaje);
      setSuspender(false);
      setMotivo("");
      recargar();
    } catch (err) {
      avisar((err as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }
  async function reactivar() {
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/vendedores/${id}/reactivar`);
      avisar(r.mensaje);
      recargar();
    } catch (err) {
      avisar((err as ErrorApi).message, "error");
    }
  }

  return (
    <>
      <Titulo
        migas={<><Link href="/admin/vendedores" className="hover:text-pino">Vendedores</Link> <ChevronRight className="size-3.5" /> {v.nombre}</>}
        titulo={v.nombre}
        detalle={`Vendedor desde ${fecha(v.creado_en)}`}
        accion={
          <div className="flex gap-3">
            {v.slug && <a href={`/t/${v.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-bold text-tinta ring-1 ring-linea">Revisar tienda</a>}
            {v.activo ? (
              <Boton onClick={() => setSuspender(true)}>Suspender cuenta</Boton>
            ) : (
              <Boton onClick={reactivar}>Reactivar cuenta</Boton>
            )}
          </div>
        }
      />
      {!v.activo && v.suspendido_motivo && <p className="rounded-2xl bg-error-claro px-5 py-3 text-sm text-error"><b>Cuenta suspendida:</b> {v.suspendido_motivo}</p>}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador oscuro titulo="Ventas" valor={v.pedidos.toLocaleString("es-PE")} detalle={soles(v.ventas_centimos)} icono={<ShoppingBag className="size-[18px]" />} />
        <Indicador titulo="Reputación" valor={rep?.t ?? "—"} detalle={rep?.d} icono={<Star className="size-[18px]" />} />
        <Indicador titulo="Reclamos" valor={d.tienda.reclamos} detalle={`${d.tienda.reclamos_perdidos} perdidos`} icono={<Flag className="size-[18px]" />} />
        <Indicador titulo="Plan" valor={v.plan || "—"} detalle={d.tienda.plan_desde ? `Desde el ${fecha(d.tienda.plan_desde)}` : undefined} icono={<Crown className="size-[18px]" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Datos">
          <dl>
            <Fila k="Correo">{v.email || "—"}</Fila>
            <Fila k="Celular">{v.celular}</Fila>
            <Fila k="Tienda">{v.tienda || "Sin tienda"}</Fila>
            <Fila k="Ciudad">{d.tienda.ciudad || "—"}</Fila>
            <Fila k="Estado"><Estado tono={e.tono}>{e.t}</Estado></Fila>
            <Fila k="Entrega">{d.tienda.entrega.join(", ") || "—"}</Fila>
          </dl>
        </Tarjeta>
        <Tarjeta titulo="Pagos de suscripción">
          {!d.pagos_plan.length ? (
            <p className="text-sm text-gris">Todavía no tiene pagos de plan.</p>
          ) : (
            d.pagos_plan.map((p, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-linea py-3 text-sm last:border-0">
                <span className="flex-1 text-tinta">{fecha(p.creado_en)} · {p.concepto}</span>
                <b className="text-tinta">{soles(p.monto_centimos)}</b>
                <Estado tono="neutro">Pagado</Estado>
              </div>
            ))
          )}
        </Tarjeta>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Identidad y dinero">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-crema/70 p-4">
            <span className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-white text-tinta"><BadgeCheck className="size-5" /></span>
              <span>
                <b className="block text-tinta">Identidad: {VERIFICACION[v.verificacion]?.texto ?? v.verificacion}</b>
                <span className="text-xs text-gris">Sin identidad verificada no puede retirar dinero.</span>
              </span>
            </span>
            {d.tienda.verificacion_id && (
              <Boton tamano="sm" variante={v.verificacion === "pendiente" ? "primario" : "secundario"} onClick={() => setRevisar(true)}>
                {v.verificacion === "pendiente" ? "Revisar identidad" : "Ver documento"}
              </Boton>
            )}
          </div>
          <dl>
            <Fila k="A liberar">{soles(d.saldos.a_liberar)}</Fila>
            <Fila k="Disponible">{soles(d.saldos.disponible)}</Fila>
            <Fila k="Retirado">{soles(d.saldos.retirado)}</Fila>
          </dl>
        </Tarjeta>
        <Tarjeta titulo="Accesos recientes">
          {!d.accesos.length ? (
            <p className="text-sm text-gris">Sin accesos registrados.</p>
          ) : (
            d.accesos.slice(0, 6).map((a, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-linea py-2.5 text-sm last:border-0">
                {a.exito ? <CheckCircle2 className="size-4 shrink-0 text-ok" /> : <XCircle className="size-4 shrink-0 text-error" />}
                <span className="min-w-0 flex-1 text-tinta">{a.exito ? "Ingreso correcto" : `Fallido · ${a.motivo}`} <span className="text-xs text-gris">· {equipo(a.agente)}{a.ip ? ` · IP ${a.ip}` : ""}</span></span>
                <span className="whitespace-nowrap text-xs text-gris">{fechaHora(a.creado_en)}</span>
              </div>
            ))
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Historial de acciones">
        {!d.historial.length ? (
          <p className="text-sm text-gris">Sin acciones registradas.</p>
        ) : (
          d.historial.map((h) => (
            <div key={h.id} className="flex items-center gap-3 border-b border-linea py-2.5 text-sm last:border-0">
              <span className="flex-1"><b className="text-tinta">{ACCIONES[h.accion] ?? h.accion}</b> <span className="text-xs text-gris">· por {h.usuario}{h.rol === "admin" ? " (admin)" : ""}</span></span>
              <span className="text-xs text-gris">{fechaHora(h.creado_en)}</span>
            </div>
          ))
        )}
      </Tarjeta>

      {d.tienda.verificacion_id && <RevisarIdentidad id={d.tienda.verificacion_id} abierto={revisar} onCerrar={() => setRevisar(false)} alTerminar={recargar} />}
      <Modal abierto={suspender} onCerrar={() => setSuspender(false)} titulo="Suspender cuenta">
        <p className="mb-3 text-sm text-gris">{v.nombre} no podrá entrar a VendiGo y se cerrarán sus sesiones al instante. Su tienda deja de verse y de recibir pedidos mientras esté suspendida.</p>
        <Area value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Motivo (ej. Vende productos prohibidos)" maxLength={300} />
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setSuspender(false)}>Cancelar</Boton>
          <Boton variante="peligro" onClick={confirmarSuspension} cargando={enviando} disabled={motivo.trim().length < 5}>Suspender</Boton>
        </div>
      </Modal>
    </>
  );
}
