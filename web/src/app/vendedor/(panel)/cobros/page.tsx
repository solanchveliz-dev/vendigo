"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Clock, Flag, Info, Landmark, Lock, ReceiptText, ShieldCheck, Star, Wallet } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import type { Saldos } from "@/lib/tipos";
import { Boton, Cargando, Modal, cn, useAvisar } from "@/components/ui";
import { usePanel } from "@/components/panel/contexto";

type Linea = { pedido_id: string; codigo: string; comprador: string; total_centimos: number; comision_centimos: number; neto_centimos: number; texto: string; estado: string };
type Retiro = { id: string; monto_centimos: number; banco: string; ultimos4: string; estado: string; creado_en: string; pedidos: number };
type Cobros = {
  saldos: Saldos;
  bloqueado_centimos: number;
  reputacion: "nueva" | "buena" | "excelente";
  dias_liberacion: number;
  a_liberar: Linea[];
  liberados: Linea[];
  retiros: Retiro[];
  cuenta: string | null;
  verificacion: string;
  puede_retirar: boolean;
  retiro_minimo_centimos: number;
};
type ReclamoFila = { id: string; pedido_id: string; codigo: string; comprador: string; motivo_texto: string; estado: string; bloqueado_centimos: number; creado_en: string };

const NIVELES = [
  { id: "nueva", dias: "5 días", texto: "Tienda nueva" },
  { id: "buena", dias: "2 días", texto: "Buena reputación" },
  { id: "excelente", dias: "Al instante", texto: "Excelente" },
];

const dia = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "");

function Fila({ l, tono }: { l: Linea; tono: "liberar" | "ok" | "reclamo" | "fecha" }) {
  const icono = { liberar: <Lock className="size-4" />, ok: <Check className="size-4" />, reclamo: <Flag className="size-4" />, fecha: <Clock className="size-4" /> }[tono];
  return (
    <Link href={`/vendedor/pedidos/${l.pedido_id}`} className="flex items-center gap-3 border-b border-linea py-3.5 last:border-0 hover:bg-crema/40">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta">{icono}</span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block"><b className="text-tinta">{l.comprador}</b> <span className="text-xs text-gris">{l.codigo}</span></span>
        <span className={cn("block text-xs", tono === "reclamo" ? "font-semibold text-tinta" : "text-gris")}>{l.texto}</span>
        <span className="block text-xs text-gris">Pagó {soles(l.total_centimos)} · Culqi -{soles(l.comision_centimos)}</span>
      </span>
      <span className="text-right">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-gris">{tono === "ok" ? "Disponible" : "A liberar"}</span>
        <b className="font-display text-tinta">{soles(l.neto_centimos)}</b>
      </span>
    </Link>
  );
}

export default function MisCobros() {
  const { datos: c, recargar } = useApi<Cobros>("/vendedor/cobros");
  const rec = useApi<{ reclamos: ReclamoFila[] }>("/vendedor/reclamos");
  const { recargarResumen } = usePanel();
  const avisar = useAvisar();
  const [retirar, setRetirar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [verTodo, setVerTodo] = useState(false);

  if (!c) return <Cargando />;
  const abiertos = rec.datos?.reclamos.filter((r) => r.estado === "abierto" || r.estado === "en_revision") ?? [];
  const falta = !c.cuenta ? "cuenta" : c.verificacion !== "aprobada" ? "verificacion" : "";
  const poco = c.saldos.disponible_centimos < c.retiro_minimo_centimos;
  const liberados = verTodo ? c.liberados : c.liberados.slice(0, 6);

  async function confirmarRetiro() {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>("/vendedor/retiros", {});
      avisar(r.mensaje);
      setRetirar(false);
      recargar();
      recargarResumen();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="max-w-2xl">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Mis cobros</h1>
        <p className="text-sm text-gris">Tus clientes pagan con Culqi. El dinero espera la entrega y luego queda disponible para que lo retires.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-[22px] bg-pino p-5 text-white shadow-suave">
          <div className="flex items-start justify-between">
            <p className="text-sm text-white/80">Disponible para retirar</p>
            <span className="grid size-9 place-items-center rounded-xl bg-white/10 text-coral"><Wallet className="size-[18px]" /></span>
          </div>
          <p className="mt-2 font-display text-3xl font-extrabold">{soles(c.saldos.disponible_centimos)}</p>
          <button onClick={() => setRetirar(true)} disabled={poco} className="relative z-10 mt-4 h-10 w-full rounded-full bg-white/15 text-sm font-bold hover:bg-white/25 disabled:opacity-50">
            Retirar a mi cuenta
          </button>
          <div className="absolute -bottom-10 -right-6 size-24 rounded-full bg-white/10" />
        </div>
        <div className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
          <div className="flex items-start justify-between">
            <p className="text-sm text-gris">A liberar</p>
            <span className="grid size-9 place-items-center rounded-xl bg-crema text-tinta"><Lock className="size-[18px]" /></span>
          </div>
          <p className="mt-2 font-display text-3xl font-extrabold text-tinta">{soles(c.saldos.a_liberar_centimos)}</p>
          <p className="mt-2 text-xs font-semibold text-tinta">
            {c.a_liberar.length} {c.a_liberar.length === 1 ? "pedido" : "pedidos"} · esperan la entrega
            {c.bloqueado_centimos > 0 && <span className="block text-error">{soles(c.bloqueado_centimos)} bloqueados por reclamos</span>}
          </p>
        </div>
        <div className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
          <div className="flex items-start justify-between">
            <p className="text-sm text-gris">Retirado</p>
            <span className="grid size-9 place-items-center rounded-xl bg-crema text-tinta"><Check className="size-[18px]" /></span>
          </div>
          <p className="mt-2 font-display text-3xl font-extrabold text-tinta">{soles(c.saldos.retirado_centimos)}</p>
          <p className="mt-2 text-xs font-semibold text-tinta">{c.retiros.length} {c.retiros.length === 1 ? "retiro" : "retiros"} a tu cuenta</p>
        </div>
      </div>

      {falta && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-aviso-claro px-4 py-3 text-sm text-tinta">
          <Info className="size-4 shrink-0 text-aviso" />
          <span className="flex-1">
            {falta === "cuenta"
              ? "Para retirar, agrega la cuenta bancaria donde quieres recibir tu dinero."
              : c.verificacion === "pendiente"
                ? "Estamos revisando tu identidad. Te avisamos cuando puedas retirar."
                : "Para retirar, primero verifica tu identidad (una sola vez)."}
          </span>
          {!(falta === "verificacion" && c.verificacion === "pendiente") && (
            <Link href={falta === "cuenta" ? "/vendedor/cuenta-bancaria" : "/vendedor/verificacion"}>
              <Boton tamano="sm">{falta === "cuenta" ? <><Landmark className="size-4" /> Agregar cuenta</> : <><ShieldCheck className="size-4" /> Verificar identidad</>}</Boton>
            </Link>
          )}
        </div>
      )}

      <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-11 place-items-center rounded-xl bg-crema text-tinta"><Star className="size-5" /></span>
          <div className="min-w-56 flex-1">
            <p className="font-bold text-tinta">{NIVELES.find((n) => n.id === c.reputacion)?.texto}</p>
            <p className="text-sm text-gris">
              Tu dinero se libera <b className="text-tinta">{c.dias_liberacion === 0 ? "al instante" : `${c.dias_liberacion} días después de la entrega`}</b>. Así protegemos al comprador por si algo llegó mal.
            </p>
          </div>
          <div className="flex gap-2">
            {NIVELES.map((n) => (
              <div key={n.id} className={cn("rounded-xl px-3 py-2 text-center ring-1", n.id === c.reputacion ? "bg-coral-claro ring-coral" : "bg-white ring-linea")}>
                <p className="text-sm font-bold">{n.dias}</p>
                <p className="text-[11px] text-gris">{n.texto}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-gris">
          Sube de nivel con más ventas entregadas y sin reclamos perdidos. <b>Tienda nueva:</b> menos de 10 ventas entregadas · <b>Buena reputación:</b> 10 ventas o más y pocos reclamos · <b>Excelente:</b> 50 ventas o más, sin reclamos perdidos.
        </p>
      </section>

      {abiertos.length > 0 && (
        <section id="reclamos" className="space-y-3">
          <h2 className="text-lg font-extrabold text-tinta">Reclamos</h2>
          {abiertos.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-[22px] bg-aviso-claro/70 p-5 ring-1 ring-aviso/20">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-pino text-white"><Flag className="size-5" /></span>
              <div className="min-w-[220px] flex-1">
                <p className="font-bold text-tinta">{r.comprador.split(" ")[0]}: “{r.motivo_texto}”</p>
                <p className="text-sm text-tinta/80">
                  {r.codigo} · {soles(r.bloqueado_centimos)} bloqueados hasta que se resuelva{r.estado === "en_revision" ? " · VendiGo está revisando tus pruebas" : ""}.
                </p>
              </div>
              <Link href={`/vendedor/cobros/reclamo/${r.pedido_id}`}>
                <Boton variante={r.estado === "abierto" ? "primario" : "secundario"}>{r.estado === "abierto" ? "Responder" : "Ver reclamo"}</Boton>
              </Link>
            </div>
          ))}
        </section>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
          <h2 className="text-lg font-extrabold text-tinta">A liberar</h2>
          <p className="text-xs text-gris">Pagos de pedidos que aún no se entregan o que esperan sus días.</p>
          <div className="mt-2">
            {c.a_liberar.length ? (
              c.a_liberar.map((l) => <Fila key={l.pedido_id} l={l} tono={l.texto.startsWith("Bloqueado") ? "reclamo" : l.estado === "entregado" ? "fecha" : "liberar"} />)
            ) : (
              <p className="py-4 text-sm text-gris">No hay pagos por liberar.</p>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
            <h2 className="text-lg font-extrabold text-tinta">Disponible</h2>
            <p className="text-xs text-gris">Pagos liberados que aún no retiras.</p>
            <div className="mt-2">
              {c.liberados.length ? liberados.map((l) => <Fila key={l.pedido_id} l={l} tono="ok" />) : <p className="py-4 text-sm text-gris">No tienes pagos por retirar.</p>}
            </div>
            {c.liberados.length > 6 && (
              <button onClick={() => setVerTodo(!verTodo)} className="mt-2 text-sm font-semibold text-pino underline underline-offset-2">
                {verTodo ? "Ver menos" : `Ver los ${c.liberados.length} pagos`}
              </button>
            )}
          </section>

          <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
            <h2 className="mb-2 text-lg font-extrabold text-tinta">Retiros a tu cuenta</h2>
            <div className="flex items-center gap-3 border-b border-linea py-3">
              <span className="grid size-10 place-items-center rounded-xl bg-crema text-tinta"><Landmark className="size-4" /></span>
              <span className="flex-1 text-sm">
                <b className="block text-tinta">{c.cuenta ?? "Sin cuenta bancaria"}</b>
                <span className="text-xs text-gris">{c.cuenta ? (c.verificacion === "aprobada" ? "Identidad verificada · retiros gratis" : "Falta verificar tu identidad") : "Agrégala para poder retirar"}</span>
              </span>
              <Link href="/vendedor/cuenta-bancaria" className="text-sm font-semibold text-tinta underline underline-offset-2">{c.cuenta ? "Cambiar" : "Agregar"}</Link>
            </div>
            {c.retiros.length ? (
              c.retiros.map((r) => (
                <Link key={r.id} href={`/vendedor/cobros/retiros/${r.id}`} className="flex items-center gap-3 border-b border-linea py-3 last:border-0 hover:bg-crema/40">
                  <span className="grid size-10 place-items-center rounded-xl bg-crema text-tinta"><ReceiptText className="size-4" /></span>
                  <span className="flex-1 text-sm">
                    <b className="block text-tinta">{dia(r.creado_en)}</b>
                    <span className="text-xs text-gris">{r.pedidos} {r.pedidos === 1 ? "pedido" : "pedidos"} · {r.estado === "pagado" ? "depositado" : "en proceso, llega en 1 día hábil"} · ver detalle</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-gris">Retiraste</span>
                    <b className="font-display text-tinta">{soles(r.monto_centimos)}</b>
                  </span>
                </Link>
              ))
            ) : (
              <p className="py-3 text-sm text-gris">Aún no haces retiros.</p>
            )}
          </section>
        </div>
      </div>

      <div className="flex gap-2.5 rounded-2xl bg-arena/60 px-4 py-3 text-sm text-tinta">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>De cada pago solo se descuenta el costo de Culqi: 3,44 % + S/ 0.69 (mínimo S/ 3.50). VendiGo no cobra comisión ni por retirar.</span>
      </div>

      <Modal abierto={retirar} onCerrar={() => setRetirar(false)} titulo="Retirar a mi cuenta">
        {falta ? (
          <div className="space-y-4">
            <p className="text-sm text-gris">{falta === "cuenta" ? "Primero agrega la cuenta bancaria donde quieres recibir tu dinero." : c.verificacion === "pendiente" ? "Estamos revisando tu identidad. Te avisamos cuando puedas retirar." : "Primero verifica tu identidad. Solo se hace una vez."}</p>
            {!(falta === "verificacion" && c.verificacion === "pendiente") && (
              <Link href={falta === "cuenta" ? "/vendedor/cuenta-bancaria" : "/vendedor/verificacion"}>
                <Boton>{falta === "cuenta" ? "Agregar cuenta" : "Verificar identidad"}</Boton>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-4 text-center ring-1 ring-linea">
              <p className="text-sm text-gris">Te depositamos</p>
              <p className="font-display text-3xl font-extrabold text-pino">{soles(c.saldos.disponible_centimos)}</p>
              <p className="text-sm text-gris">en {c.cuenta}</p>
            </div>
            <p className="text-xs text-gris">Retiras todo lo disponible ({c.liberados.length} {c.liberados.length === 1 ? "pago" : "pagos"}). Llega en 1 día hábil. VendiGo no cobra por retirar.</p>
            <Boton bloque variante="acento" cargando={enviando} onClick={confirmarRetiro}>Confirmar retiro</Boton>
          </div>
        )}
      </Modal>
    </div>
  );
}
