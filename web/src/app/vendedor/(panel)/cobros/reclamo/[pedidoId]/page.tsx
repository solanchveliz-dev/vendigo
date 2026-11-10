"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { Camera, Check, ChevronRight, Clock, FileText, Flag, Lock, ShieldCheck } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import { subirImagen } from "@/lib/subir";
import type { PedidoDetalle } from "@/lib/tipos";
import { Area, Boton, Cargando, Modal, cn, useAvisar } from "@/components/ui";
import { usePanel } from "@/components/panel/contexto";

// "Responder reclamo": la tienda envía sus pruebas o acepta devolver el dinero.
export default function ResponderReclamo({ params }: { params: Promise<{ pedidoId: string }> }) {
  const { pedidoId } = use(params);
  const router = useRouter();
  const avisar = useAvisar();
  const { recargarResumen } = usePanel();
  const { datos: p, setDatos } = useApi<PedidoDetalle>(`/vendedor/pedidos/${pedidoId}`);
  const [mensaje, setMensaje] = useState("");
  const [fotos, setFotos] = useState<{ key: string; url: string }[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [devolver, setDevolver] = useState(false);

  if (!p) return <Cargando />;
  const r = p.reclamo_detalle;
  const migas = (
    <p className="flex items-center gap-1.5 text-sm text-gris">
      <Link href="/vendedor/cobros" className="hover:text-pino">Mis cobros</Link> <ChevronRight className="size-3.5" /> Reclamo
    </p>
  );
  if (!r) {
    return (
      <div className="space-y-4">
        {migas}
        <p className="text-sm text-gris">Este pedido no tiene reclamos.</p>
      </div>
    );
  }
  const reclamo = r;
  const nombre = p.comprador.split(" ")[0];
  const caso = `C-${p.codigo.replace(/\D/g, "").slice(-4)}`;
  const horas = Math.max(0, Math.ceil(24 - (Date.now() - new Date(reclamo.creado_en).getTime()) / 3600000));
  const abierto = reclamo.estado === "abierto";
  const resuelto = reclamo.estado === "a_favor_comprador" || reclamo.estado === "a_favor_vendedor";
  const paso = abierto ? 1 : reclamo.estado === "en_revision" ? 2 : 3;

  async function agregar(file?: File) {
    if (!file) return;
    setSubiendo(true);
    try {
      const f = await subirImagen(file, "reclamo");
      setFotos((x) => [...x, f]);
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setSubiendo(false);
    }
  }

  async function enviar() {
    setEnviando(true);
    try {
      setDatos(await api.post<PedidoDetalle>(`/vendedor/reclamos/${reclamo.id}/responder`, { mensaje, evidencias: fotos.map((f) => f.key) }));
      recargarResumen();
      avisar("Pruebas enviadas. VendiGo las revisa y te avisa.");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarDevolucion() {
    setEnviando(true);
    try {
      setDatos(await api.post<PedidoDetalle>(`/vendedor/reclamos/${reclamo.id}/devolver`, {}));
      recargarResumen();
      setDevolver(false);
      avisar(`Reclamo aceptado. Devuélvele a ${nombre} lo que pagó e infórmalo con tu captura.`);
      router.push(`/vendedor/pedidos/${pedidoId}`);
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const pasos = [
    { t: "Reclamo enviado", d: "El cliente abrió el caso" },
    { t: "La tienda responde", d: abierto ? (horas > 0 ? `Tienes ${horas} h` : "Responde lo antes posible") : reclamo.respondido_en ? `Respondiste el ${fecha(reclamo.respondido_en)}` : "" },
    { t: "VendiGo revisa", d: reclamo.estado === "en_revision" ? "Revisando tus pruebas" : "" },
    { t: "Resuelto", d: reclamo.estado === "a_favor_vendedor" ? "A tu favor: el pedido queda entregado" : reclamo.estado === "a_favor_comprador" ? "A favor del cliente: debes devolverle su pago" : "" },
  ];

  return (
    <div className="space-y-5">
      {migas}
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">{abierto ? "Responder reclamo" : "Reclamo"}</h1>
        <p className="text-sm text-gris">Caso {caso} · {p.producto}{p.items > 1 ? ` y ${p.items - 1} más` : ""} · pedido {p.codigo}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-[22px] bg-aviso-claro/70 p-5 ring-1 ring-aviso/20">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-pino text-white"><Flag className="size-5" /></span>
        <div className="min-w-[220px] flex-1">
          <p className="font-display text-lg font-extrabold text-tinta">{nombre}: “{reclamo.motivo_texto}”</p>
          {reclamo.descripcion && <p className="text-sm text-tinta">{reclamo.descripcion}</p>}
          <p className="mt-1 flex items-center gap-1 text-xs text-tinta/70">
            <Lock className="size-3.5" /> {resuelto ? "Reclamo resuelto." : `Pedido de ${soles(p.total_centimos)}. Si VendiGo le da la razón al cliente, deberás devolverle lo que te pagó.`}
          </p>
          {reclamo.fotos.length > 0 && (
            <div className="mt-2 flex gap-2">
              {reclamo.fotos.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Foto del cliente" className="size-16 rounded-lg object-cover" /></a>
              ))}
            </div>
          )}
        </div>
        {abierto && (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-aviso"><Clock className="size-4" /> {horas > 0 ? `${horas} h para responder` : "Responde ya"}</span>
        )}
      </div>

      {abierto && (
        <div className="flex gap-2.5 rounded-2xl bg-arena/60 px-4 py-3 text-sm text-tinta">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span><b>VendiGo te pide tu boleta de envío.</b> Revisaremos que esté a nombre de tu cliente, con la agencia que eligió, y consultaremos el código en la agencia.</span>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <h3 className="text-lg font-extrabold text-tinta">Tus pruebas</h3>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><FileText className="size-4" /></span>
            <div className="min-w-0 flex-1 text-sm">
              {p.envio ? (
                <>
                  <b className="block text-tinta">Envío por {p.envio.agencia}</b>
                  <span className="text-xs text-gris">{p.envio.numero_orden ? `Código ${p.envio.numero_orden} · ` : ""}enviado el {fecha(p.envio.registrado_en)}</span>
                </>
              ) : (
                <b className="text-tinta">Sin datos de envío registrados</b>
              )}
            </div>
            {p.envio?.boleta_url && <span className="rounded-full bg-pino-claro px-2.5 py-1 text-xs font-bold text-pino">● Se adjunta sola</span>}
          </div>
          {p.envio?.boleta_url && (
            <a href={p.envio.boleta_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm text-tinta">
              <Check className="size-4" /> Ver foto de la boleta
            </a>
          )}

          {abierto ? (
            <>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-tinta">Otra prueba <span className="font-normal text-gris">(opcional)</span></p>
                <div className="flex flex-wrap items-center gap-2">
                  {fotos.map((f) => <img key={f.key} src={f.url} alt="" className="size-14 rounded-lg object-cover" />)}
                  <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-tinta ring-1 ring-linea hover:bg-crema">
                    <Camera className="size-4" /> {subiendo ? "Subiendo…" : "Foto del paquete o del rastreo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => agregar(e.target.files?.[0])} />
                  </label>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-semibold text-tinta">Tu respuesta</p>
                <Area rows={4} maxLength={600} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Ej. Lo dejé en Shalom el 19/09, aquí está la boleta." />
              </div>
              <div className="flex flex-wrap gap-2">
                <Boton cargando={enviando} disabled={mensaje.trim().length < 10} onClick={enviar}>Enviar pruebas</Boton>
                <Boton variante="secundario" onClick={() => setDevolver(true)}>Devolver el dinero</Boton>
              </div>
            </>
          ) : (
            reclamo.respuesta_vendedor && (
              <div className="rounded-2xl bg-crema px-4 py-3 text-sm">
                <b className="block text-tinta">Tu respuesta</b>
                {reclamo.respuesta_vendedor}
                {reclamo.evidencias.length > 0 && <span className="mt-1 block text-xs text-gris">{reclamo.evidencias.length} {reclamo.evidencias.length === 1 ? "prueba enviada" : "pruebas enviadas"}</span>}
              </div>
            )
          )}
        </section>

        <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <h3 className="mb-4 text-lg font-extrabold text-tinta">¿Qué pasa ahora?</h3>
          <ol>
            {pasos.map((s, i) => {
              const hecho = i < paso || (resuelto && i === 3);
              const ahora = i === paso && !resuelto;
              return (
                <li key={s.t} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < pasos.length - 1 && <span className={cn("absolute left-[11px] top-7 h-[calc(100%-24px)] w-0.5", hecho ? "bg-pino" : "bg-linea")} />}
                  <span className={cn("relative z-10 grid size-6 shrink-0 place-items-center rounded-full", hecho ? "bg-pino text-white" : ahora ? "bg-white ring-4 ring-coral-claro outline outline-2 outline-coral" : "bg-white ring-2 ring-linea")}>
                    {hecho && <Check className="size-3.5" />}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-tinta">{s.t}</p>
                    {s.d && <p className="text-xs text-gris">{s.d}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex gap-2.5 rounded-2xl bg-arena/60 px-4 py-3 text-sm text-tinta">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>La boleta de envío es la prueba más fuerte: muestra que lo enviaste y a quién.</span>
          </div>
        </section>
      </div>

      <Modal abierto={devolver} onCerrar={() => setDevolver(false)} titulo="¿Devolver el dinero?">
        <p className="text-sm text-gris">
          Aceptas el reclamo: el pedido se cancela y el reclamo queda cerrado. Si {nombre} ya te pagó, tú le devuelves lo que pagó (hasta {soles(p.total_centimos)}) por el mismo medio y lo informas con tu captura desde el pedido. No se puede deshacer.
        </p>
        <div className="mt-4 flex gap-2">
          <Boton variante="peligro" cargando={enviando} onClick={confirmarDevolucion}>Sí, devolver el dinero</Boton>
          <Boton variante="secundario" onClick={() => setDevolver(false)}>Cancelar</Boton>
        </div>
      </Modal>
    </div>
  );
}
