"use client";

import Link from "next/link";
import { use, useState } from "react";
import { Camera, Check, CheckCircle2, ChevronRight, Flag, Lock, Printer, Sparkles, Truck, X } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha, nombreEntrega, nombrePago, soles } from "@/lib/formato";
import { subirImagen } from "@/lib/subir";
import type { PedidoDetalle } from "@/lib/tipos";
import { Aviso, Boton, Campo, Cargando, Entrada, Area, Modal, Tarjeta, useAvisar } from "@/components/ui";
import { EstadoPedido } from "@/components/pedidos/estado";
import { usePanel } from "@/components/panel/contexto";

function Dato({ k, v }: { k: string; v?: React.ReactNode }) {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-gris">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export default function DetallePedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: p, setDatos, recargar } = useApi<PedidoDetalle>(`/vendedor/pedidos/${id}`);
  const { recargarResumen } = usePanel();
  const avisar = useAvisar();
  const [modal, setModal] = useState<"" | "rechazar" | "enviar" | "recojo" | "reclamo">("");
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
  const a = p.acciones;

  return (
    <div className="space-y-5">
      <p className="no-imprimir flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/pedidos" className="hover:text-pino">Pedidos</Link> <ChevronRight className="size-3.5" /> {p.codigo}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
          <h1 className="text-[28px] font-extrabold text-pino">Pedido {p.codigo}</h1>
          <p className="text-sm text-gris">
            {p.comprador} · {fecha(p.creado_en, true)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.includes("rechazar") && (
            <Boton variante="peligro" onClick={() => setModal("rechazar")}>
              <X className="size-4" /> No puedo atenderlo
            </Boton>
          )}
          {a.includes("aceptar") && (
            <Boton variante="acento" cargando={ocupado} onClick={() => accion("aceptar", {}, "Pedido aceptado. Ya puedes prepararlo.")}>
              <Check className="size-4" /> Aceptar pedido
            </Boton>
          )}
          {a.includes("etiqueta") && (
            <Link href={`/vendedor/pedidos/${id}/etiqueta`}>
              <Boton variante="secundario">
                <Printer className="size-4" /> Etiqueta
              </Boton>
            </Link>
          )}
          {a.includes("enviar") && (
            <Boton variante="acento" onClick={() => setModal("enviar")}>
              <Truck className="size-4" /> {p.entrega === "agencia" ? "Registrar envío" : "Salió el motorizado"}
            </Boton>
          )}
          {a.includes("listo_recojo") && (
            <Boton variante="acento" cargando={ocupado} onClick={() => accion("listo-recojo", {}, "Avisamos al cliente que ya puede recoger.")}>
              <Check className="size-4" /> Listo para recoger
            </Boton>
          )}
          {a.includes("entregar_recojo") && (
            <Boton variante="acento" onClick={() => setModal("recojo")}>
              <Check className="size-4" /> Entregar al cliente
            </Boton>
          )}
          {a.includes("responder_reclamo") && (
            <Boton variante="acento" onClick={() => setModal("reclamo")}>
              <Flag className="size-4" /> Responder reclamo
            </Boton>
          )}
        </div>
      </div>

      {p.estado === "por_aceptar" && <Aviso>El cliente ya pagó con pago protegido. Si no puedes atenderlo, se le devuelve todo su dinero.</Aviso>}
      {p.reclamo_detalle && (
        <Tarjeta className="ring-error/30">
          <div className="flex items-center gap-2">
            <Flag className="size-4 text-error" />
            <h2 className="font-extrabold text-error">Reclamo: {p.reclamo_detalle.motivo_texto}</h2>
          </div>
          <p className="mt-2 text-sm">{p.reclamo_detalle.descripcion}</p>
          {p.reclamo_detalle.respuesta_vendedor ? (
            <Aviso className="mt-3">
              Tu respuesta: “{p.reclamo_detalle.respuesta_vendedor}”. VendiGo revisa las pruebas ({p.reclamo_detalle.evidencias.length}) y te avisará. El dinero sigue bloqueado.
            </Aviso>
          ) : (
            <Aviso tono="aviso" className="mt-3">
              Responde con tu boleta de envío como prueba. Mientras tanto, el dinero de este pedido queda bloqueado.
            </Aviso>
          )}
        </Tarjeta>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Tarjeta>
            <h2 className="mb-3 font-extrabold text-pino">Productos</h2>
            {p.items_detalle.map((it, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="size-14 overflow-hidden rounded-xl bg-arena">{it.imagen_url && <img src={it.imagen_url} alt="" className="size-full object-cover" />}</div>
                <div className="flex-1">
                  <p className="font-semibold">{it.nombre}</p>
                  <p className="text-sm text-gris">
                    {it.variante && `${it.variante} · `}
                    {it.cantidad} × {soles(it.precio_centimos)}
                  </p>
                </div>
                <p className="font-semibold">{soles(it.precio_centimos * it.cantidad)}</p>
              </div>
            ))}
            {p.nota_comprador && <Aviso className="mt-3">Nota del cliente: {p.nota_comprador}</Aviso>}
          </Tarjeta>

          <Tarjeta>
            <h2 className="mb-2 font-extrabold text-pino">Entrega · {nombreEntrega[p.entrega]}</h2>
            <Dato k="Cliente" v={p.comprador} />
            <Dato k="Celular" v={p.comprador_celular} />
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
            {p.entrega === "recojo" && <Aviso className="mt-2">El cliente muestra un código de 4 dígitos al recoger. Pídeselo para entregarle el pedido.</Aviso>}
            {p.envio && (
              <div className="mt-3 rounded-xl bg-crema p-3">
                <Dato k="Enviado por" v={p.envio.agencia} />
                <Dato k="N.° de orden" v={p.envio.numero_orden} />
                <Dato k="Clave de recojo" v={p.envio.clave_recojo} />
                <Dato k="Nota" v={p.envio.nota} />
                {p.envio.boleta_url && (
                  <a href={p.envio.boleta_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-semibold text-pino underline">
                    Ver boleta de envío
                  </a>
                )}
              </div>
            )}
          </Tarjeta>
        </div>

        <div className="space-y-5">
          <Tarjeta>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-extrabold text-pino">Estado</h2>
              <EstadoPedido estado={p.estado} texto={p.estado_texto} />
            </div>
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-crema font-bold text-pino">
                {p.comprador.split(" ").slice(0, 2).map((x) => x[0]).join("")}
              </span>
              <span>
                <span className="block font-semibold">{p.comprador}</span>
                <span className="block text-sm text-gris">Celular {p.comprador_celular}</span>
              </span>
            </div>
          </Tarjeta>

          <Tarjeta>
            <h2 className="mb-2 font-extrabold text-pino">Pago</h2>
            <Dato
              k="Estado"
              v={
                <span className="rounded-full bg-arena px-2.5 py-0.5 text-xs font-semibold">
                  {p.pago_estado === "devuelto" ? "Devuelto" : p.pago_estado === "pendiente" ? "Paga al recibir" : p.liberado ? "Cobrado" : "Pago confirmado"}
                </span>
              }
            />
            <Dato k="Entrega" v={nombreEntrega[p.entrega]} />
            <Dato k="Método" v={nombrePago[p.metodo_pago]} />
            <p className="mt-2 text-xs text-gris">El dinero se libera a tu cuenta cuando tu cliente recibe el pedido.</p>
          </Tarjeta>

          <Tarjeta>
            <h2 className="mb-2 font-extrabold text-pino">Tu cobro</h2>
            {p.envio_centimos > 0 && <Dato k="Productos" v={soles(p.subtotal_centimos)} />}
            {p.envio_centimos > 0 && <Dato k="Envío" v={soles(p.envio_centimos)} />}
            <Dato k="Pagó tu cliente (Culqi)" v={soles(p.total_centimos)} />
            {p.comision_pasarela_centimos > 0 && <Dato k="Costo de Culqi" v={`-${soles(p.comision_pasarela_centimos)}`} />}
            <div className="mt-2 flex items-baseline justify-between border-t border-linea pt-3">
              <span className="font-display text-lg font-extrabold">Te llega</span>
              <span className="font-display text-2xl font-extrabold text-pino">{soles(p.pago_estado === "pendiente" ? p.total_centimos : p.neto_centimos)}</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-gris">
              <Lock className="size-3.5" />
              {p.pago_estado === "devuelto"
                ? "Se devolvió al cliente"
                : p.pago_estado === "pendiente"
                  ? "El cliente paga al recibir"
                  : p.liberado
                    ? "Liberado: ya está en Mis cobros"
                    : p.liberar_en
                      ? `Se libera el ${fecha(p.liberar_en)}`
                      : "A liberar: se libera después de la entrega"}
            </p>
          </Tarjeta>

          <Tarjeta>
            <h2 className="mb-3 font-extrabold text-pino">Lo que ve el cliente</h2>
            <ol className="space-y-3">
              {p.eventos.map((e, i) => (
                <li key={i} className="flex gap-3">
                  <CheckCircle2 className={`mt-0.5 size-5 shrink-0 ${i === p.eventos.length - 1 ? "text-coral" : "text-pino"}`} />
                  <div>
                    <p className="text-sm">{e.detalle}</p>
                    <p className="text-xs text-gris">{fecha(e.fecha, true)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Tarjeta>

          {process.env.NEXT_PUBLIC_DEMO === "1" && (p.estado === "enviado" || p.estado === "entregado") && (
            <Tarjeta className="no-imprimir bg-arena/40">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gris">Simular comprador (pruebas)</p>
              <div className="flex flex-wrap gap-2">
                {p.estado === "enviado" && (
                  <Boton tamano="sm" variante="secundario" onClick={() => demo("confirmar", {}, p.metodo_pago === "al_recibir" ? "El cliente pagó al recibir" : "El cliente confirmó que lo recibió")}>
                    {p.metodo_pago === "al_recibir" ? "Pagó al recibir" : "Confirmó que lo recibió"}
                  </Boton>
                )}
                {!p.reclamo_detalle && p.entrega !== "motorizado" && (
                  <Boton tamano="sm" variante="secundario" onClick={() => demo("reclamo", { motivo: "no_llego" }, "El cliente abrió un reclamo")}>
                    Reclamó “No me llegó”
                  </Boton>
                )}
              </div>
            </Tarjeta>
          )}
        </div>
      </div>

      <ModalRechazo abierto={modal === "rechazar"} cerrar={() => setModal("")} enviar={(motivo) => accion("rechazar", { motivo }, "Pedido rechazado. Se devolvió el dinero al cliente.")} />
      <ModalEnvio abierto={modal === "enviar"} cerrar={() => setModal("")} pedido={p} enviar={(d) => accion("enviar", d, "Listo. El cliente ya ve su pedido en camino.")} />
      <ModalRecojo abierto={modal === "recojo"} cerrar={() => setModal("")} enviar={(codigo) => accion("entregar-recojo", { codigo }, "Pedido entregado.")} />
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

function ModalRechazo({ abierto, cerrar, enviar }: { abierto: boolean; cerrar: () => void; enviar: (m: string) => Promise<boolean> }) {
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
        <Aviso>Le devolvemos al cliente todo su dinero por el mismo medio de pago.</Aviso>
        <Boton bloque variante="peligro" disabled={!motivo.trim()} onClick={() => enviar(motivo)}>
          Rechazar pedido
        </Boton>
      </div>
    </Modal>
  );
}

function ModalEnvio({ abierto, cerrar, pedido, enviar }: { abierto: boolean; cerrar: () => void; pedido: PedidoDetalle; enviar: (d: unknown) => Promise<boolean> }) {
  const avisar = useAvisar();
  const [boleta, setBoleta] = useState<{ key: string; url: string } | null>(null);
  const [f, setF] = useState({ numero_orden: "", clave_recojo: "", nota: "" });
  const [subiendo, setSubiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const agencia = pedido.entrega === "agencia";

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      setBoleta(await subirImagen(file, "boleta"));
    } catch (err) {
      avisar((err as Error).message, "error");
    } finally {
      setSubiendo(false);
    }
  }

  async function leerConIA() {
    if (!boleta) return;
    setLeyendo(true);
    try {
      const r = await api.post<{ datos: { numero_orden: string; clave_recojo: string } }>("/vendedor/ia/leer-boleta", { boleta_key: boleta.key });
      setF({ ...f, numero_orden: r.datos.numero_orden || f.numero_orden, clave_recojo: r.datos.clave_recojo || f.clave_recojo });
      avisar("La IA llenó los datos. Revisa que coincidan con la boleta.");
    } catch (err) {
      avisar((err as ErrorApi).message, "error");
    } finally {
      setLeyendo(false);
    }
  }

  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo={agencia ? "Registrar envío por agencia" : "El motorizado salió"}>
      {agencia ? (
        <div className="space-y-4">
          <Aviso>La boleta es tu prueba si el cliente reclama. El cliente verá el número de orden y la clave para recoger.</Aviso>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-linea bg-white p-5 text-center">
            {boleta ? <img src={boleta.url} alt="Boleta" className="max-h-48 rounded-lg" /> : <Camera className="size-8 text-pino" />}
            <span className="text-sm font-semibold text-pino">{subiendo ? "Subiendo…" : boleta ? "Cambiar foto" : "Sube la foto de la boleta"}</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={elegir} />
          </label>
          {boleta && (
            <Boton bloque variante="secundario" cargando={leyendo} onClick={leerConIA}>
              <Sparkles className="size-4" /> Llenar datos con IA (2 créditos)
            </Boton>
          )}
          <Campo etiqueta="N.° de orden">
            <Entrada value={f.numero_orden} onChange={(e) => setF({ ...f, numero_orden: e.target.value })} />
          </Campo>
          <Campo etiqueta="Clave de recojo (si la agencia la da)">
            <Entrada value={f.clave_recojo} onChange={(e) => setF({ ...f, clave_recojo: e.target.value })} />
          </Campo>
          <Boton bloque variante="acento" disabled={!boleta || !f.numero_orden} onClick={() => enviar({ ...f, boleta_key: boleta?.key, agencia: pedido.agencia })}>
            Confirmar envío
          </Boton>
        </div>
      ) : (
        <div className="space-y-4">
          <Aviso>El cliente paga desde su app cuando reciba el pedido. Si no llega, no paga nada.</Aviso>
          <Campo etiqueta="Nota para el cliente (opcional)">
            <Area value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder="Llega entre 3 y 5 p. m." />
          </Campo>
          <Boton bloque variante="acento" onClick={() => enviar({ nota: f.nota })}>
            Confirmar
          </Boton>
        </div>
      )}
    </Modal>
  );
}

function ModalRecojo({ abierto, cerrar, enviar }: { abierto: boolean; cerrar: () => void; enviar: (c: string) => Promise<boolean> }) {
  const [codigo, setCodigo] = useState("");
  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo="Entregar al cliente">
      <div className="space-y-4">
        <p className="text-sm text-gris">Pídele al cliente el código de recojo que aparece en su pedido.</p>
        <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" className="h-14 text-center font-display text-2xl tracking-[0.5em]" placeholder="••••" />
        <Boton bloque variante="acento" disabled={codigo.length !== 4} onClick={() => enviar(codigo)}>
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
