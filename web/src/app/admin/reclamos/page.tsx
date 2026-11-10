"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Crown, Flag, RefreshCw, XCircle } from "lucide-react";
import { DEVOLUCION } from "@/components/pagos/estado";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { fechaHora } from "@/lib/admin";
import { Area, Boton, Cargando, Modal, cn, useAvisar } from "@/components/ui";
import { Indicador, Nota, Titulo, useExportar } from "@/components/admin/ui";

type Reclamo = {
  id: string;
  pedido_id: string;
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
  devolucion: string;
  entrega: string;
  agencia: string;
  numero_orden: string;
  boleta: boolean;
  reputacion: string;
  cliente_reclamos_antes: number;
  tienda_reclamos_perdidos: number;
  confirmado_por: string;
};
type Datos = { reclamos: Reclamo[]; indicadores: { devoluciones_pendientes_centimos: number; devoluciones_pendientes: number; abiertos: number; ingresos_planes_mes_centimos: number } };

const MOTIVOS: Record<string, string> = { no_llego: "No me llegó", danado: "Llegó dañado", distinto: "Es distinto a lo publicado", incompleto: "Llegó incompleto", otro: "Otro", pago_no_reconocido: "Pago no reconocido" };
const ESTADOS: Record<string, string> = { abierto: "Esperando a la tienda", en_revision: "Por decidir", a_favor_comprador: "A favor del cliente", a_favor_vendedor: "A favor de la tienda" };
const REP: Record<string, string> = { nueva: "tienda nueva", buena: "buena reputación", excelente: "reputación excelente" };

function Caja({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 ring-1 ring-linea">
      <p className="mb-1.5 text-[13px] text-gris">{titulo}</p>
      <div className="space-y-0.5 text-sm text-tinta">{children}</div>
    </div>
  );
}

function Fotos({ urls }: { urls: string[] }) {
  if (!urls.length) return <p className="text-xs text-gris">Sin fotos</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <a key={i} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="size-16 rounded-xl bg-crema object-cover ring-1 ring-linea" /></a>
      ))}
    </div>
  );
}

function Check({ ok, titulo, detalle }: { ok: boolean | null; titulo: string; detalle: string }) {
  return (
    <div className="flex gap-2.5">
      {ok === true ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" /> : ok === false ? <XCircle className="mt-0.5 size-5 shrink-0 text-error" /> : <Circle className="mt-0.5 size-5 shrink-0 text-gris" />}
      <span>
        <b className="block text-sm text-tinta">{titulo}</b>
        <span className="text-xs text-gris">{detalle}</span>
      </span>
    </div>
  );
}

export default function Reclamos() {
  const [todos, setTodos] = useState(false);
  const { datos, recargar } = useApi<Datos>(`/admin/reclamos?estado=${todos ? "todos" : "abiertos"}`);
  const [decidir, setDecidir] = useState<{ c: Reclamo; aFavor: "comprador" | "vendedor" } | null>(null);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useAvisar();

  useExportar("reclamos", () => [
    ["Pedido", "Comprador", "Tienda", "Monto (S/)", "Motivo", "Estado", "Abierto", "Decisión"],
    ...(datos?.reclamos ?? []).map((c) => [c.codigo, c.comprador, c.tienda, (c.total_centimos / 100).toFixed(2), MOTIVOS[c.motivo] ?? c.motivo, ESTADOS[c.estado] ?? c.estado, c.creado_en.slice(0, 16).replace("T", " "), c.nota_admin]),
  ]);

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

  if (!datos) return <Cargando />;
  const k = datos.indicadores;

  return (
    <>
      <Titulo titulo="Reclamos" detalle="Comparas las pruebas del cliente y de la tienda y decides. VendiGo no guarda el dinero: si das la razón al cliente, la tienda debe devolverle lo que pagó." />
      <div className="grid gap-5 md:grid-cols-3">
        <Indicador titulo="Devoluciones pendientes" valor={k.devoluciones_pendientes} detalle={`${soles(k.devoluciones_pendientes_centimos)} que las tiendas deben devolver`} icono={<RefreshCw className="size-[18px]" />} alerta={k.devoluciones_pendientes > 0} />
        <Indicador oscuro titulo="Reclamos abiertos" valor={k.abiertos} detalle="Responde en 24 a 48 h" icono={<Flag className="size-[18px]" />} />
        <Indicador titulo="Ingresos por planes" valor={soles(k.ingresos_planes_mes_centimos)} detalle="Este mes" icono={<Crown className="size-[18px]" />} />
      </div>

      <div className="flex w-fit gap-1 rounded-full bg-white p-1 ring-1 ring-linea">
        {([[false, "Abiertos"], [true, "Todos"]] as const).map(([v, t]) => (
          <button key={t} onClick={() => setTodos(v)} className={cn("h-9 rounded-full px-4 text-sm font-semibold", todos === v ? "bg-pino text-white" : "text-tinta")}>{t}</button>
        ))}
      </div>

      {!datos.reclamos.length ? (
        <p className="rounded-[22px] bg-white p-6 text-sm text-gris ring-1 ring-linea/70">{todos ? "Todavía no hay reclamos." : "No hay reclamos abiertos. 🎉"}</p>
      ) : (
        datos.reclamos.map((c) => {
          const abierto = c.estado === "abierto" || c.estado === "en_revision";
          const guia = c.entrega === "agencia" && c.motivo !== "pago_no_reconocido";
          return (
            <article key={c.id} className="rounded-[22px] bg-white p-6 ring-1 ring-linea/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <b className="text-[17px] text-tinta">{c.codigo} · {c.comprador} → {c.tienda}</b>
                  <p className="text-sm text-gris">{soles(c.total_centimos)} · “{MOTIVOS[c.motivo] ?? c.motivo}” · {fechaHora(c.creado_en)}</p>
                </div>
                <span className="flex items-center gap-1.5 text-sm font-bold text-tinta"><span className="size-1.5 rounded-full bg-current" />{ESTADOS[c.estado] ?? c.estado}</span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Caja titulo="Pruebas del cliente">
                  <p>{c.descripcion || "Sin descripción."}</p>
                  <Fotos urls={c.fotos} />
                </Caja>
                <Caja titulo="Pruebas de la tienda">
                  {guia && c.numero_orden && <p>Envío {c.agencia}: <b>{c.numero_orden}</b></p>}
                  {c.respuesta_vendedor ? <p>{c.respuesta_vendedor}</p> : <p className="text-gris">Aún no responde.</p>}
                  <Fotos urls={c.evidencias} />
                </Caja>
                <Caja titulo="Historial">
                  <p>Cliente: {c.cliente_reclamos_antes} {c.cliente_reclamos_antes === 1 ? "reclamo" : "reclamos"} antes</p>
                  <p>Tienda: {c.tienda_reclamos_perdidos} {c.tienda_reclamos_perdidos === 1 ? "reclamo perdido" : "reclamos perdidos"} · {REP[c.reputacion] ?? c.reputacion}</p>
                </Caja>
              </div>

              <div className="mt-4 rounded-2xl p-4 ring-1 ring-linea">
                <p className="mb-3 text-[13px] text-gris">Revisión de VendiGo</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Check ok={guia ? !!c.numero_orden : null} titulo="Boleta de envío" detalle={guia ? (c.numero_orden ? `${c.agencia} ${c.numero_orden}${c.boleta ? " · con foto" : ""}` : "La tienda no registró el envío") : "No aplica (no fue por agencia)"} />
                  <Check ok={c.respuesta_vendedor ? true : null} titulo="Respuesta de la tienda" detalle={c.respondido_en ? `Respondió el ${fechaHora(c.respondido_en)}` : "Por responder"} />
                  <Check ok={c.evidencias.length || c.fotos.length ? true : null} titulo="Fotos de ambas partes" detalle={`Cliente ${c.fotos.length} · tienda ${c.evidencias.length}`} />
                  <Check ok={c.confirmado_por ? true : null} titulo="Entrega confirmada" detalle={{ comprador: "El cliente la confirmó", automatico: "Se dio por recibido", vendedor: "Entregado en tienda", vendigo: "VendiGo resolvió el reclamo" }[c.confirmado_por] ?? "Sin confirmar"} />
                </div>
              </div>

              {c.nota_admin && <p className="mt-3 text-sm text-gris"><b className="text-tinta">Decisión de VendiGo:</b> {c.nota_admin}</p>}
              {c.devolucion && <p className="mt-2 text-sm text-gris"><b className="text-tinta">Devolución:</b> {DEVOLUCION[c.devolucion as keyof typeof DEVOLUCION] ?? c.devolucion}</p>}
              {abierto && (
                <div className="mt-4 flex flex-wrap justify-end gap-3">
                  <Boton variante="secundario" onClick={() => { setNota(""); setDecidir({ c, aFavor: "comprador" }); }} >Dar la razón al cliente</Boton>
                  <Boton onClick={() => { setNota(""); setDecidir({ c, aFavor: "vendedor" }); }}>Dar la razón a la tienda</Boton>
                </div>
              )}
            </article>
          );
        })
      )}
      <Nota>Si un cliente pierde varios reclamos, se le advierte y luego se limita su cuenta. Lo mismo aplica a las tiendas.</Nota>

      <Modal abierto={!!decidir} onCerrar={() => setDecidir(null)} titulo={decidir?.aFavor === "comprador" ? "Dar la razón al cliente" : "Dar la razón a la tienda"}>
        {decidir && (
          <div className="space-y-4">
            <p className="text-sm text-gris">
              {decidir.aFavor === "comprador"
                ? `El pedido ${decidir.c.codigo} se cancela. Si el cliente ya pagó, la tienda debe devolverle ${soles(decidir.c.total_centimos)} e informarlo con su comprobante.`
                : `El reclamo se cierra y el pedido ${decidir.c.codigo} queda como entregado.`}
            </p>
            <Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Explica la decisión (la verán la tienda y el cliente)" maxLength={500} />
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setDecidir(null)}>Cancelar</Boton>
              <Boton variante={decidir.aFavor === "comprador" ? "peligro" : "primario"} onClick={confirmar} cargando={enviando} disabled={nota.trim().length < 10}>Confirmar decisión</Boton>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
