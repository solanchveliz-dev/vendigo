"use client";

import Link from "next/link";
import { use, useState } from "react";
import { Camera, ChevronRight, Flag, Lock } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha, nombrePago, soles } from "@/lib/formato";
import { subirImagen } from "@/lib/subir";
import type { PedidoDetalle } from "@/lib/tipos";
import { Aviso, Boton, Campo, Cargando, Entrada, Area, Modal, Tarjeta, useAvisar } from "@/components/ui";
import { EstadoPedido } from "@/components/pedidos/estado";
import { AvisoAccion, LineaTiempo } from "@/components/pedidos/pasos";
import { TarjetaPago } from "@/components/pagos/tarjeta-pago";
import { iconoEntrega } from "@/components/pedidos/tabla";
import { TarjetaAyuda } from "@/components/pedidos/ayuda";
import { usePanel } from "@/components/panel/contexto";

function Dato({ k, v }: { k: string; v?: React.ReactNode }) {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-gris">{k}</span>
      <span className="text-right font-medium text-tinta">{v}</span>
    </div>
  );
}

export default function DetallePedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: p, setDatos, recargar } = useApi<PedidoDetalle>(`/vendedor/pedidos/${id}`);
  const { recargarResumen } = usePanel();
  const avisar = useAvisar();
  const [modal, setModal] = useState<"" | "rechazar" | "recojo" | "reclamo">("");
  const [ocupado, setOcupado] = useState(false);

  async function accion(ruta: string, cuerpo: unknown, mensaje: string) {
    setOcupado(true);
    try {
      const d = await api.post<PedidoDetalle>(`/vendedor/pedidos/${id}/${ruta}`, cuerpo);
      setDatos(d);
      setModal("");
      avisar(mensaje);
      recargarResumen();
      return true;
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function demo(ruta: string, cuerpo: unknown, mensaje: string) {
    try {
      await api.post(`/dev/pedidos/${id}/${ruta}`, cuerpo);
      avisar(mensaje);
      recargar();
      recargarResumen();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }

  if (!p) return <Cargando />;
  const IconoEnt = iconoEntrega[p.entrega];

  return (
    <div className="space-y-5">
      <p className="no-imprimir flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/pedidos" className="hover:text-pino">Pedidos</Link> <ChevronRight className="size-3.5" /> {p.codigo}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
          <h1 className="text-[34px] font-extrabold leading-tight text-pino">Pedido {p.codigo}</h1>
          <p className="text-sm text-gris">
            {p.comprador} · {fecha(p.creado_en, true)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <EstadoPedido estado={p.estado} texto={p.estado_texto} />
          <Link href={`/vendedor/pedidos/${id}/estado`}>
            <Boton variante="secundario">Quién hace cada paso</Boton>
          </Link>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="min-w-0 space-y-5">
          <AvisoAccion
            pedido={p}
            ocupado={ocupado}
            alAceptar={() => accion("aceptar", {}, "Pedido aceptado. Ya puedes prepararlo.")}
            alRechazar={() => setModal("rechazar")}
            alEntregar={() => setModal("recojo")}
            alResponder={() => setModal("reclamo")}
          />

          {p.reclamo_detalle && (
            <Tarjeta className="ring-error/30">
              <div className="flex items-center gap-2">
                <Flag className="size-4 text-error" />
                <h2 className="font-extrabold text-error">Reclamo: {p.reclamo_detalle.motivo_texto}</h2>
              </div>
              <p className="mt-2 text-sm">{p.reclamo_detalle.descripcion}</p>
              {p.reclamo_detalle.respuesta_vendedor && (
                <Aviso className="mt-3">
                  Tu respuesta: “{p.reclamo_detalle.respuesta_vendedor}”. VendiGo revisa las pruebas ({p.reclamo_detalle.evidencias.length}) y te avisará.
                </Aviso>
              )}
            </Tarjeta>
          )}

          <Tarjeta>
            <h2 className="mb-2 text-lg font-extrabold text-tinta">Productos</h2>
            {p.items_detalle.map((it, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-linea py-3.5">
                <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-arena">{it.imagen_url && <img src={it.imagen_url} alt="" className="size-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-tinta">{it.nombre}</p>
                  <p className="text-sm text-gris">
                    {it.variante && `${it.variante} · `}x{it.cantidad}
                  </p>
                </div>
                <p className="font-bold">{soles(it.precio_centimos * it.cantidad)}</p>
              </div>
            ))}
            <div className="flex justify-between border-b border-linea py-3.5 text-sm">
              <span>Entrega</span>
              <span>{p.envio_centimos > 0 ? soles(p.envio_centimos) : p.entrega === "recojo" ? "Gratis" : "Lo coordinas con el cliente"}</span>
            </div>
            <div className="flex items-baseline justify-between pt-3.5">
              <span className="font-display text-xl font-extrabold">Total</span>
              <span className="font-display text-xl font-extrabold">{soles(p.total_centimos)}</span>
            </div>
            {p.nota_comprador && <Aviso className="mt-3">Nota del cliente: {p.nota_comprador}</Aviso>}
          </Tarjeta>

          <Tarjeta>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><IconoEnt className="size-5" /></span>
              <div>
                <p className="font-bold text-tinta">{p.entrega === "agencia" ? "Envío por agencia" : p.entrega === "motorizado" ? "Delivery con motorizado" : "Recojo en tienda"}</p>
                <p className="text-sm text-gris">{p.entrega === "recojo" ? "El cliente pasa por tu tienda con su código" : "Tú lo despachas; VendiGo registra la información"}</p>
              </div>
            </div>
            <div className="mt-3">
              {p.entrega === "agencia" && (
                <>
                  <Dato k="DNI (para la agencia)" v={p.comprador_dni} />
                  <Dato k="Agencia de destino" v={p.agencia_sede || p.agencia} />
                  <Dato k="Ciudad" v={p.ciudad} />
                </>
              )}
              {p.entrega === "motorizado" && (
                <>
                  <Dato k="Dirección" v={p.direccion} />
                  <Dato k="Distrito" v={p.distrito} />
                  <Dato k="Referencia" v={p.referencia} />
                </>
              )}
            </div>
            {p.envio ? (
              <div className="mt-3 rounded-xl bg-crema p-3">
                {p.entrega === "motorizado" ? (
                  <>
                    <Dato k="Lo lleva" v={p.envio.motorizado_nombre} />
                    <Dato k="Celular" v={p.envio.motorizado_celular} />
                  </>
                ) : (
                  <>
                    <Dato k="Enviado por" v={p.envio.agencia} />
                    <Dato k="Código de envío" v={p.envio.numero_orden} />
                    <Dato k="Clave de recojo" v={p.envio.clave_recojo} />
                  </>
                )}
                <Dato k="Nota" v={p.envio.nota} />
                <Dato k="Registrado" v={fecha(p.envio.registrado_en, true)} />
                {p.envio.boleta_url && (
                  <a href={p.envio.boleta_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-pino underline">
                    Ver boleta de envío
                  </a>
                )}
              </div>
            ) : (
              p.estado === "preparando" && (
                <p className="mt-2 text-sm text-gris">
                  {p.entrega === "agencia" ? "Cuando lo dejes en la agencia, toca “Ya lo envié”." : p.entrega === "motorizado" ? "Cuando salga tu motorizado, toca “Ya salió”." : "Cuando esté listo, toca “Ya está listo”."}
                </p>
              )
            )}
          </Tarjeta>

          <Tarjeta>
            <h2 className="mb-4 text-lg font-extrabold text-tinta">Lo que ve tu cliente</h2>
            <LineaTiempo pedido={p} />
          </Tarjeta>

          {process.env.NEXT_PUBLIC_DEMO === "1" && !["rechazado", "cancelado"].includes(p.estado) && (
            <Tarjeta className="no-imprimir bg-arena/40">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gris">Simular comprador (pruebas)</p>
              <div className="flex flex-wrap gap-2">
                {p.estado === "enviado" && (
                  <Boton tamano="sm" variante="secundario" onClick={() => demo("confirmar", {}, p.metodo_pago === "al_recibir" ? "El cliente pagó al recibir" : "El cliente confirmó que lo recibió")}>
                    {p.metodo_pago === "al_recibir" ? "Pagó al recibir" : "Confirmó que lo recibió"}
                  </Boton>
                )}
                {!p.ayuda?.abierta && (
                  <Boton tamano="sm" variante="secundario" onClick={() => demo("ayuda", {}, "El cliente pidió ayuda con su pedido")}>
                    Pidió ayuda con su pedido
                  </Boton>
                )}
                {(p.estado === "enviado" || p.estado === "entregado") && !p.reclamo_detalle && p.entrega !== "motorizado" && (
                  <Boton tamano="sm" variante="secundario" onClick={() => demo("reclamo", { motivo: "no_llego" }, "El cliente abrió un reclamo")}>
                    Reclamó “No me llegó”
                  </Boton>
                )}
              </div>
            </Tarjeta>
          )}
        </div>

        <div className="space-y-5">
          {p.ayuda && <TarjetaAyuda ayuda={p.ayuda} alResponder={() => { recargar(); recargarResumen(); }} />}
          <Tarjeta>
            <h2 className="mb-3 text-lg font-extrabold text-tinta">Cliente</h2>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-crema text-sm font-bold text-tinta">
                {p.comprador.split(" ").slice(0, 2).map((x) => x[0]).join("")}
              </span>
              <span>
                <span className="block font-bold">{p.comprador}</span>
                <span className="block text-sm text-gris">{p.pedidos_cliente} {p.pedidos_cliente === 1 ? "pedido" : "pedidos"} en tu tienda</span>
              </span>
            </div>
            <div className="mt-3">
              <Dato k="Celular" v={p.comprador_celular} />
            </div>
          </Tarjeta>

          <TarjetaPago
            pedido={p}
            informarPago={(recibido, referencia) => accion("pago", { recibido, referencia }, recibido ? "Listo: registramos que recibiste el pago." : "Le avisamos al cliente que no te llegó el pago.")}
            informarDevolucion={(evidencia_key, nota) => accion("devolucion", { evidencia_key, nota }, "Devolución informada. El cliente la verá en su seguimiento.")}
          />
        </div>
      </div>

      <ModalRechazo abierto={modal === "rechazar"} cerrar={() => setModal("")} pagado={!!p.pago && ["informado_tienda", "comprobante_enviado"].includes(p.pago.estado)} enviar={(motivo) => accion("rechazar", { motivo }, "Pedido rechazado. Le avisamos al cliente.")} />
      <ModalEntregar
        abierto={modal === "recojo"}
        cerrar={() => setModal("")}
        pagaAlRecibir={p.pago?.estado === "paga_al_recibir" || p.pago?.estado === "adelanto_informado"}
        monto={p.pago?.estado === "adelanto_informado" ? p.total_centimos - (p.pago?.adelanto_centimos ?? 0) : p.total_centimos}
        enviar={(codigo, pago_recibido) => accion("entregar", { codigo, pago_recibido }, "Pedido entregado.")}
      />
      <ModalReclamo
        abierto={modal === "reclamo"}
        cerrar={() => setModal("")}
        enviar={async (d) => {
          try {
            const r = await api.post<PedidoDetalle>(`/vendedor/reclamos/${p.reclamo_detalle!.id}/responder`, d);
            setDatos(r);
            setModal("");
            avisar("Respuesta enviada. VendiGo revisará las pruebas.");
            recargarResumen();
            return true;
          } catch (e) {
            avisar((e as ErrorApi).message, "error");
            return false;
          }
        }}
      />
    </div>
  );
}

function ModalRechazo({ abierto, cerrar, enviar, pagado }: { abierto: boolean; cerrar: () => void; enviar: (m: string) => Promise<boolean>; pagado: boolean }) {
  const [motivo, setMotivo] = useState("");
  const opciones = ["Me quedé sin stock", "No hago envíos a esa ciudad", "No puedo atenderlo a tiempo"];
  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="¿Por qué no puedes atenderlo?">
      <div className="space-y-3">
        {opciones.map((o) => (
          <button key={o} onClick={() => setMotivo(o)} className={`block w-full rounded-xl px-4 py-3 text-left text-sm font-semibold ring-1 ${motivo === o ? "bg-pino text-white ring-pino" : "bg-white ring-linea"}`}>
            {o}
          </button>
        ))}
        <Entrada value={opciones.includes(motivo) ? "" : motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Otro motivo" />
        <Aviso>{pagado ? "Como el cliente ya te pagó, tendrás que devolverle su dinero e informarlo con tu captura." : "El cliente todavía no pagó, así que no hay nada que devolver."}</Aviso>
        <Boton bloque variante="peligro" disabled={!motivo.trim()} onClick={() => enviar(motivo)}>
          Rechazar pedido
        </Boton>
      </div>
    </Modal>
  );
}

function ModalEntregar({ abierto, cerrar, enviar, pagaAlRecibir, monto }: { abierto: boolean; cerrar: () => void; enviar: (c: string, pago: boolean) => Promise<boolean>; pagaAlRecibir: boolean; monto: number }) {
  const [codigo, setCodigo] = useState("");
  const [pago, setPago] = useState(false);
  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Entregar al cliente">
      <div className="space-y-4">
        <p className="text-sm text-gris">Pídele al cliente el código de entrega de 4 dígitos que aparece en su seguimiento.</p>
        <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" className="h-14 text-center font-display text-2xl tracking-[0.5em]" placeholder="••••" />
        {pagaAlRecibir && (
          <label className="flex items-start gap-3 rounded-xl bg-arena/60 p-3 text-sm">
            <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-pino)]" />
            <span>Ya me llegó el pago de <b>{soles(monto)}</b> por Yape o Plin.</span>
          </label>
        )}
        <Boton bloque variante="acento" disabled={codigo.length !== 4 || (pagaAlRecibir && !pago)} onClick={() => enviar(codigo, pago)}>
          Confirmar entrega
        </Boton>
      </div>
    </Modal>
  );
}

function ModalReclamo({ abierto, cerrar, enviar }: { abierto: boolean; cerrar: () => void; enviar: (d: { mensaje: string; evidencias: string[] }) => Promise<boolean> }) {
  const avisar = useAvisar();
  const [mensaje, setMensaje] = useState("");
  const [fotos, setFotos] = useState<{ key: string; url: string }[]>([]);
  async function agregar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const f = await subirImagen(file, "reclamo");
      setFotos([...fotos, f]);
    } catch (err) {
      avisar((err as Error).message, "error");
    }
  }
  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Responder reclamo">
      <div className="space-y-4">
        <Aviso>Tu boleta de envío se adjunta sola. Puedes agregar más pruebas (rastreo, conversación, fotos del paquete).</Aviso>
        <Campo etiqueta="¿Qué pasó?">
          <Area value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Envié el pedido el lunes por Shalom. El rastreo dice que llegó a la agencia de destino." />
        </Campo>
        <div className="flex flex-wrap gap-2">
          {fotos.map((f) => (
            <img key={f.key} src={f.url} alt="" className="size-20 rounded-lg object-cover" />
          ))}
          <label className="grid size-20 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-linea text-pino">
            <Camera className="size-5" />
            <input type="file" accept="image/*" className="hidden" onChange={agregar} />
          </label>
        </div>
        <Boton bloque variante="acento" disabled={mensaje.trim().length < 10} onClick={() => enviar({ mensaje, evidencias: fotos.map((f) => f.key) })}>
          Enviar respuesta
        </Boton>
      </div>
    </Modal>
  );
}
