"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Flag, Landmark, Lock, ShieldCheck, Star, Wallet } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { aCentimos, fecha, soles } from "@/lib/formato";
import type { Saldos } from "@/lib/tipos";
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Modal, Tarjeta, cn, useAvisar } from "@/components/ui";
import { usePanel } from "@/components/panel/contexto";

type Linea = { pedido_id: string; codigo: string; comprador: string; total_centimos: number; comision_centimos: number; neto_centimos: number; texto: string };
type Retiro = { id: string; monto_centimos: number; banco: string; ultimos4: string; estado: string; creado_en: string };
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
type ReclamoFila = { id: string; pedido_id: string; codigo: string; comprador: string; motivo_texto: string; estado: string; bloqueado_centimos: number };

const niveles = [
  { id: "nueva", dias: "5 días", texto: "Tienda nueva" },
  { id: "buena", dias: "2 días", texto: "Buena reputación" },
  { id: "excelente", dias: "Al instante", texto: "Excelente" },
];

function FilaCobro({ l, tono }: { l: Linea; tono: "liberar" | "ok" }) {
  return (
    <Link href={`/vendedor/pedidos/${l.pedido_id}`} className="flex items-center gap-3 py-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tono === "ok" ? "bg-ok-claro text-ok" : "bg-arena text-pino")}>
        {tono === "ok" ? <CheckCircle2 className="size-4" /> : <Lock className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">
          {l.comprador} <span className="text-xs font-normal text-gris">{l.codigo}</span>
        </span>
        <span className="block text-sm text-gris">{l.texto}</span>
        <span className="block text-xs text-gris">
          Pagó {soles(l.total_centimos)} · Culqi -{soles(l.comision_centimos)}
        </span>
      </span>
      <span className="font-display font-extrabold text-pino">{soles(l.neto_centimos)}</span>
    </Link>
  );
}

export default function MisCobros() {
  const { datos: c, recargar } = useApi<Cobros>("/vendedor/cobros");
  const rec = useApi<{ reclamos: ReclamoFila[] }>("/vendedor/reclamos");
  const { recargarResumen } = usePanel();
  const avisar = useAvisar();
  const [retirar, setRetirar] = useState(false);
  const [monto, setMonto] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!c) return <Cargando />;
  const abiertos = rec.datos?.reclamos.filter((r) => r.estado === "abierto" || r.estado === "en_revision") ?? [];

  async function confirmarRetiro() {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>("/vendedor/retiros", { monto_centimos: aCentimos(monto) });
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

  const faltaParaRetirar = !c.cuenta ? "cuenta" : c.verificacion !== "aprobada" ? "verificacion" : "";

  return (
    <div className="space-y-6">
      <Encabezado titulo="Mis cobros" detalle="Tus clientes pagan con Culqi. El dinero espera la entrega y luego queda disponible para que lo retires." />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-pino p-5 text-white">
          <p className="text-sm text-white/70">Disponible para retirar</p>
          <p className="font-display text-3xl font-extrabold">{soles(c.saldos.disponible_centimos)}</p>
          <Boton variante="secundario" tamano="sm" className="mt-4" onClick={() => { setMonto((c.saldos.disponible_centimos / 100).toFixed(2)); setRetirar(true); }} disabled={c.saldos.disponible_centimos < c.retiro_minimo_centimos}>
            <Wallet className="size-4" /> Retirar a mi cuenta
          </Boton>
          <div className="absolute -right-8 -top-8 size-28 rounded-full bg-white/5" />
        </div>
        <Tarjeta>
          <p className="text-sm text-gris">A liberar</p>
          <p className="font-display text-2xl font-extrabold text-pino">{soles(c.saldos.a_liberar_centimos)}</p>
          <p className="text-sm text-gris">
            {c.a_liberar.length} pedidos · esperan la entrega
            {c.bloqueado_centimos > 0 && <span className="block text-error">{soles(c.bloqueado_centimos)} bloqueados por reclamos</span>}
          </p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-sm text-gris">Retirado</p>
          <p className="font-display text-2xl font-extrabold text-pino">{soles(c.saldos.retirado_centimos)}</p>
          <p className="text-sm text-gris">{c.retiros.length} retiros a tu cuenta</p>
        </Tarjeta>
      </div>

      {faltaParaRetirar && (
        <Aviso tono="aviso" className="flex flex-wrap items-center justify-between gap-3">
          <span>{faltaParaRetirar === "cuenta" ? "Para retirar, agrega la cuenta bancaria donde quieres recibir tu dinero." : c.verificacion === "pendiente" ? "Estamos revisando tu identidad. Te avisaremos cuando puedas retirar." : "Para retirar, primero verifica tu identidad."}</span>
          {!(faltaParaRetirar === "verificacion" && c.verificacion === "pendiente") && (
            <Link href={faltaParaRetirar === "cuenta" ? "/vendedor/cuenta-bancaria" : "/vendedor/verificacion"}>
              <Boton tamano="sm">{faltaParaRetirar === "cuenta" ? <><Landmark className="size-4" /> Agregar cuenta</> : <><ShieldCheck className="size-4" /> Verificar identidad</>}</Boton>
            </Link>
          )}
        </Aviso>
      )}

      <Tarjeta>
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-11 place-items-center rounded-xl bg-pino-claro text-pino">
            <Star className="size-5" />
          </span>
          <div className="min-w-56 flex-1">
            <p className="font-semibold">{niveles.find((n) => n.id === c.reputacion)?.texto}</p>
            <p className="text-sm text-gris">Tu dinero se libera {c.dias_liberacion === 0 ? "al instante" : `${c.dias_liberacion} días`} después de la entrega.</p>
          </div>
          <div className="flex gap-2">
            {niveles.map((n) => (
              <div key={n.id} className={cn("rounded-xl px-3 py-2 text-center ring-1", n.id === c.reputacion ? "bg-coral-claro ring-coral" : "bg-white ring-linea")}>
                <p className="text-sm font-bold">{n.dias}</p>
                <p className="text-[11px] text-gris">{n.texto}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-sm text-gris">Sube de nivel con más ventas entregadas y sin reclamos perdidos. Así protegemos al comprador por si algo llegó mal.</p>
      </Tarjeta>

      {abiertos.length > 0 && (
        <section id="reclamos">
          <h2 className="mb-3 text-lg font-extrabold text-pino">Reclamos</h2>
          <div className="space-y-2">
            {abiertos.map((r) => (
              <Link key={r.id} href={`/vendedor/pedidos/${r.pedido_id}`} className="flex items-center gap-3 rounded-xl bg-aviso-claro px-4 py-3">
                <Flag className="size-5 text-aviso" />
                <span className="flex-1">
                  <span className="block font-semibold">
                    {r.comprador}: “{r.motivo_texto}”
                  </span>
                  <span className="block text-sm text-gris">
                    {r.codigo} · {soles(r.bloqueado_centimos)} bloqueados {r.estado === "abierto" ? "· responde con tu boleta" : "· VendiGo está revisando"}
                  </span>
                </span>
                {r.estado === "abierto" && <span className="rounded-full bg-pino px-3 py-1.5 text-sm font-semibold text-white">Responder</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta>
          <h2 className="font-extrabold text-pino">A liberar</h2>
          <p className="text-sm text-gris">Pagos de pedidos que aún no se entregan o que esperan sus días.</p>
          <div className="mt-2 divide-y divide-linea">
            {c.a_liberar.length ? c.a_liberar.map((l) => <FilaCobro key={l.pedido_id} l={l} tono="liberar" />) : <p className="py-4 text-sm text-gris">No hay pagos por liberar.</p>}
          </div>
        </Tarjeta>
        <Tarjeta>
          <h2 className="font-extrabold text-pino">Disponible</h2>
          <p className="text-sm text-gris">Pagos que ya puedes retirar.</p>
          <div className="mt-2 divide-y divide-linea">
            {c.liberados.length ? c.liberados.map((l) => <FilaCobro key={l.pedido_id} l={l} tono="ok" />) : <p className="py-4 text-sm text-gris">Aún no se libera ningún pago.</p>}
          </div>
        </Tarjeta>
      </div>

      {c.retiros.length > 0 && (
        <Tarjeta>
          <h2 className="mb-2 font-extrabold text-pino">Retiros</h2>
          <div className="divide-y divide-linea">
            {c.retiros.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-3 text-sm">
                <span>
                  <span className="block font-semibold">
                    {r.banco} •••• {r.ultimos4}
                  </span>
                  <span className="text-gris">{fecha(r.creado_en, true)}</span>
                </span>
                <span className="text-right">
                  <span className="block font-display font-extrabold">{soles(r.monto_centimos)}</span>
                  <span className={r.estado === "pagado" ? "text-ok" : "text-aviso"}>{r.estado === "pagado" ? "Depositado" : "En proceso · 1 día hábil"}</span>
                </span>
              </div>
            ))}
          </div>
        </Tarjeta>
      )}

      <Modal abierto={retirar} onCerrar={() => setRetirar(false)} titulo="Retirar a mi cuenta">
        {faltaParaRetirar ? (
          <Aviso tono="aviso">{faltaParaRetirar === "cuenta" ? "Primero agrega tu cuenta bancaria." : "Primero verifica tu identidad."}</Aviso>
        ) : (
          <div className="space-y-4">
            <Campo etiqueta="Monto (S/)" ayuda={`Disponible: ${soles(c.saldos.disponible_centimos)} · mínimo S/ 10`}>
              <Entrada value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" />
            </Campo>
            <Aviso>Lo depositamos en {c.cuenta}. Llega en 1 día hábil. VendiGo no cobra por retirar.</Aviso>
            <Boton bloque variante="acento" cargando={enviando} onClick={confirmarRetiro}>
              Retirar {soles(aCentimos(monto))}
            </Boton>
          </div>
        )}
      </Modal>
    </div>
  );
}
