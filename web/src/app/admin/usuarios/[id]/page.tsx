"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ChevronRight, KeyRound, Mail, Package, Shield } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { ACCIONES, ESTADO_USUARIO, ROLES, fecha, fechaHora, type UsuarioAdmin } from "@/lib/admin";
import { Area, Boton, Cargando, Modal, useAvisar } from "@/components/ui";
import { Estado, Tarjeta, Titulo } from "@/components/admin/ui";

type Detalle = { usuario: UsuarioAdmin; actividad: { tipo: "acceso" | "pedido" | "accion"; texto: string; creado_en: string }[] };

function hace(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    return h < 1 ? "Hace un momento" : `Hace ${h} h`;
  }
  return `Hace ${d} día(s)`;
}

export default function DetalleUsuario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: d, error, recargar } = useApi<Detalle>(`/admin/usuarios/${id}`);
  const avisar = useAvisar();
  const [modal, setModal] = useState<"" | "suspender" | "mensaje">("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (error && !d) return <p className="text-sm text-gris">No encontramos esta cuenta.</p>;
  if (!d) return <Cargando />;
  const u = d.usuario;
  const est = ESTADO_USUARIO[u.estado];
  const ini = u.nombre.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

  async function hacer(ruta: string, cuerpo?: unknown) {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/usuarios/${id}/${ruta}`, cuerpo);
      avisar(r.mensaje);
      setModal("");
      setTexto("");
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const accionPrincipal =
    u.rol === "admin" ? null : u.estado === "suspendido" || u.estado === "bloqueado" ? (
      <Boton onClick={() => hacer("reactivar")} cargando={enviando}>Reactivar cuenta</Boton>
    ) : (
      <Boton onClick={() => setModal("suspender")}>Suspender cuenta</Boton>
    );

  return (
    <>
      <Titulo
        migas={<><Link href="/admin/usuarios" className="hover:text-pino">Usuarios</Link> <ChevronRight className="size-3.5" /> {u.nombre}</>}
        titulo={u.nombre}
        detalle={u.email || u.celular}
        accion={accionPrincipal}
      />
      {u.estado === "suspendido" && u.suspendido_motivo && <p className="rounded-2xl bg-error-claro px-5 py-3 text-sm text-error"><b>Cuenta suspendida:</b> {u.suspendido_motivo}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          <Tarjeta titulo="Datos de la cuenta">
            <dl className="space-y-2.5 text-[15px]">
              {[
                ["Rol", (ROLES[u.rol]?.t ?? u.rol).toLowerCase()],
                ["Estado", <Estado key="e" tono={est?.tono ?? "neutro"}>{est?.t ?? u.estado}</Estado>],
                ["Celular", u.celular],
                ["Ciudad", u.ciudad || "—"],
                ["Registro", fecha(u.creado_en)],
                ["Último acceso", fechaHora(u.ultimo_acceso)],
                ...(u.tienda ? [["Tienda", <Link key="t" href={`/admin/tiendas/${u.tienda_id}`} className="font-semibold hover:text-pino">{u.tienda}</Link>]] : []),
              ].map(([k, v]) => (
                <div key={String(k)} className="grid grid-cols-[150px_1fr] items-center gap-3">
                  <dt className="text-gris">{k}</dt>
                  <dd className="text-tinta">{v}</dd>
                </div>
              ))}
            </dl>
          </Tarjeta>
          <Tarjeta titulo="Actividad reciente">
            {!d.actividad.length ? (
              <p className="text-sm text-gris">Sin actividad registrada.</p>
            ) : (
              d.actividad.map((a, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-linea py-3.5 last:border-0">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-crema text-tinta">
                    {a.tipo === "acceso" ? <KeyRound className="size-[18px]" /> : a.tipo === "pedido" ? <Package className="size-[18px]" /> : <Shield className="size-[18px]" />}
                  </span>
                  <span className="flex-1 text-sm text-tinta">{a.tipo === "accion" ? ACCIONES[a.texto] ?? a.texto : a.texto}</span>
                  <span className="text-xs text-gris" title={fechaHora(a.creado_en)}>{hace(a.creado_en)}</span>
                </div>
              ))
            )}
          </Tarjeta>
        </div>
        <div className="space-y-5">
          <section className="flex items-center gap-4 rounded-[22px] bg-white p-6 ring-1 ring-linea/70">
            <span className="grid size-[72px] place-items-center rounded-full bg-crema font-display text-2xl font-extrabold text-tinta">{ini}</span>
            <span>
              <b className="block text-tinta">{u.nombre}</b>
              <span className="text-sm text-gris">{u.pedidos} {u.pedidos === 1 ? "pedido" : "pedidos"}</span>
            </span>
          </section>
          {u.rol !== "admin" && (
            <Tarjeta titulo="Acciones">
              <div className="space-y-3">
                <button onClick={() => hacer("cambio-password")} disabled={enviando} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-tinta ring-1 ring-linea hover:bg-crema disabled:opacity-60">
                  <KeyRound className="size-4" /> Enviar cambio de contraseña
                </button>
                <button onClick={() => setModal("mensaje")} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-tinta ring-1 ring-linea hover:bg-crema">
                  <Mail className="size-4" /> Enviar mensaje
                </button>
              </div>
              <p className="mt-3 text-xs text-gris">El cambio de contraseña le llega como código por SMS. El mensaje le aparece en sus notificaciones.</p>
            </Tarjeta>
          )}
        </div>
      </div>

      <Modal abierto={modal !== ""} onCerrar={() => setModal("")} titulo={modal === "suspender" ? "Suspender cuenta" : "Enviar mensaje"}>
        <p className="mb-3 text-sm text-gris">
          {modal === "suspender" ? `${u.nombre} no podrá entrar a VendiGo y se cerrarán sus sesiones al instante.` : `Le llegará a ${u.nombre} como aviso de VendiGo.`}
        </p>
        <Area value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={modal === "suspender" ? "Motivo de la suspensión" : "Escribe tu mensaje"} maxLength={modal === "suspender" ? 300 : 500} />
        <div className="mt-4 flex justify-end gap-2">
          <Boton variante="secundario" onClick={() => setModal("")}>Cancelar</Boton>
          <Boton
            variante={modal === "suspender" ? "peligro" : "primario"}
            cargando={enviando}
            disabled={texto.trim().length < 5}
            onClick={() => (modal === "suspender" ? hacer("suspender", { motivo: texto }) : hacer("mensaje", { texto }))}
          >
            {modal === "suspender" ? "Suspender" : "Enviar"}
          </Boton>
        </div>
      </Modal>
    </>
  );
}
