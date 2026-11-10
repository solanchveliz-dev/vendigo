"use client";

import Link from "next/link";
import { use, useRef, useState } from "react";
import { Check, Copy, Flag, ImagePlus, KeyRound, MessageCircle, PartyPopper, ShieldCheck } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import type { PedidoDetalle } from "@/lib/tipos";
import { Area, Aviso, Boton, Campo, Cargando, Entrada, Modal, Selector, useAvisar } from "@/components/ui";
import { LineaTiempo } from "@/components/pedidos/pasos";
import { DEVOLUCION, EtiquetaPago } from "@/components/pagos/estado";
import { CabeceraPublica } from "@/components/tienda/cabecera";
import { PieLegal } from "@/components/legal/pie";

type TiendaPago = { nombre: string; slug: string; yape_numero: string; plin_numero: string; pago_titular: string; pago_qr_url: string; whatsapp: string };
type Datos = { pedido: PedidoDetalle; tienda: TiendaPago };

const MOTIVOS: Record<string, string> = { no_llego: "No me llegó", danado: "Llegó dañado", distinto: "Es distinto a lo publicado", incompleto: "Llegó incompleto", otro: "Otro problema" };

// Sube una imagen al bucket privado con una URL firmada para este pedido.
async function subir(token: string, tipo: "comprobante" | "reclamo", f: File) {
  if (f.size > 8 * 1024 * 1024) throw new Error("La imagen puede pesar hasta 8 MB.");
  const s = await api.post<{ key: string; url_subida: string }>(`/seguimiento/${token}/archivo`, { tipo, content_type: f.type || "image/jpeg", tamano: f.size });
  const r = await fetch(s.url_subida, { method: "PUT", headers: { "Content-Type": f.type || "image/jpeg" }, body: f });
  if (!r.ok) throw new Error("No se pudo subir la imagen. Inténtalo de nuevo.");
  return s.key;
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
      <h2 className="mb-3 text-lg font-extrabold text-tinta">{titulo}</h2>
      {children}
    </section>
  );
}

export default function Seguimiento({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [nuevo] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("nuevo") === "1");
  const { datos, error, recargar } = useApi<Datos>(`/seguimiento/${token}`);
  const avisar = useAvisar();
  const archivo = useRef<HTMLInputElement>(null);
  const fotos = useRef<HTMLInputElement>(null);
  const [ref, setRef] = useState("");
  const [captura, setCaptura] = useState<{ key: string; nombre: string } | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [reclamar, setReclamar] = useState(false);
  const [rec, setRec] = useState({ motivo: "", descripcion: "", fotos: [] as string[] });

  if (error) {
    return (
      <div className="min-h-screen bg-crema">
        <CabeceraPublica />
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <h1 className="text-[28px] font-extrabold text-pino">No encontramos este pedido</h1>
          <p className="mt-2 text-sm text-gris">Revisa que el enlace esté completo. Es el que te enviamos por SMS al hacer tu pedido.</p>
        </main>
      </div>
    );
  }
  if (!datos) return <Cargando />;
  const { pedido: p, tienda: t } = datos;
  const pago = p.pago;
  const puede = (a: string) => p.acciones.includes(a);
  const cerrado = p.estado === "rechazado" || p.estado === "cancelado";
  const copiar = (v: string) => navigator.clipboard?.writeText(v).then(() => avisar("Copiado"), () => undefined);

  async function hacer(nombre: string, fn: () => Promise<{ mensaje?: string } | unknown>) {
    setOcupado(nombre);
    try {
      const r = (await fn()) as { mensaje?: string } | undefined;
      if (r?.mensaje) avisar(r.mensaje);
      recargar();
      return true;
    } catch (e) {
      avisar((e as ErrorApi).message || (e as Error).message, "error");
      return false;
    } finally {
      setOcupado("");
    }
  }

  async function subirCaptura(f?: File) {
    if (!f) return;
    await hacer("captura", async () => {
      const key = await subir(token, "comprobante", f);
      setCaptura({ key, nombre: f.name });
    });
    if (archivo.current) archivo.current.value = "";
  }

  async function subirFotos(lista: FileList | null) {
    if (!lista?.length) return;
    await hacer("fotos", async () => {
      const keys: string[] = [];
      for (const f of Array.from(lista).slice(0, 5 - rec.fotos.length)) keys.push(await subir(token, "reclamo", f));
      setRec((r) => ({ ...r, fotos: [...r.fotos, ...keys] }));
    });
    if (fotos.current) fotos.current.value = "";
  }

  const pagarAhora = pago && ["pendiente", "no_recibido", "comprobante_enviado"].includes(pago.estado) && pago.momento !== "al_recibir" && !cerrado;
  const esAdelanto = pago?.momento === "adelanto";
  const montoAhora = pago ? (esAdelanto ? pago.adelanto_centimos : pago.monto_centimos) : 0;
  // Lo que falta pagar al recibir (todo, o el resto del adelanto).
  const pagarAlRecibir = pago && !cerrado && p.estado !== "entregado" && (pago.estado === "paga_al_recibir" || pago.estado === "adelanto_informado");
  const montoAlRecibir = pago ? (pago.estado === "adelanto_informado" ? pago.monto_centimos - pago.adelanto_centimos : pago.monto_centimos) : 0;
  const devoluciones = (p.devoluciones ?? []).filter((d) => d.estado !== "de_prueba");

  return (
    <div className="min-h-screen bg-crema">
      <CabeceraPublica />
      <main className="mx-auto max-w-[1000px] space-y-5 px-5 pb-16 pt-6 sm:px-10">
        {nuevo && (
          <div className="flex items-start gap-3 rounded-[22px] bg-pino p-5 text-white">
            <PartyPopper className="mt-0.5 size-6 shrink-0 text-coral" />
            <div className="text-sm">
              <p className="font-display text-lg font-extrabold">¡Pedido registrado!</p>
              <p className="text-white/85">Guarda este enlace: aquí ves cómo va tu pedido. También te lo enviamos por SMS.</p>
              <button onClick={() => copiar(window.location.href.replace("?nuevo=1", ""))} className="mt-2 inline-flex items-center gap-1.5 font-bold text-coral"><Copy className="size-4" /> Copiar enlace</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
            <h1 className="text-[30px] font-extrabold leading-tight text-pino">Pedido {p.codigo}</h1>
            <p className="text-sm text-gris">
              <Link href={`/t/${t.slug}`} className="font-semibold text-tinta hover:text-pino">{t.nombre}</Link> · {fecha(p.creado_en, true)} · {p.estado_texto}
            </p>
          </div>
          {t.whatsapp && (
            <a href={`https://wa.me/51${t.whatsapp}`} target="_blank" rel="noreferrer">
              <Boton variante="secundario"><MessageCircle className="size-4" /> Escribir a la tienda</Boton>
            </a>
          )}
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            {pagarAhora && pago && (
              <Seccion titulo={pago.estado === "comprobante_enviado" ? "Pago enviado" : esAdelanto ? "Paga el adelanto" : "Paga a la tienda"}>
                {pago.estado === "no_recibido" && <Aviso tono="error" className="mb-3">La tienda dice que todavía no le llega tu pago. Revisa el número y vuelve a enviar tu comprobante.</Aviso>}
                {pago.estado === "comprobante_enviado" ? (
                  <p className="text-sm text-gris">Enviaste tu comprobante. La tienda lo revisa en su app y, cuando lo confirme, prepara tu pedido. Si te equivocaste, puedes enviarlo otra vez.</p>
                ) : (
                  <p className="text-sm text-gris">
                    Paga <b className="text-tinta">{soles(montoAhora)}</b>{esAdelanto && <> de adelanto (el resto, {soles(pago.monto_centimos - montoAhora)}, al recibir)</>} directo a {t.nombre} por Yape o Plin. VendiGo no recibe este dinero.
                  </p>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {pago.metodo === "yape_directo" && t.yape_numero && (
                    <div className="rounded-2xl bg-crema/70 p-4">
                      <p className="text-xs text-gris">Yape</p>
                      <p className="font-display text-2xl font-extrabold text-tinta">{t.yape_numero}</p>
                      <button onClick={() => copiar(t.yape_numero)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-pino"><Copy className="size-3.5" /> Copiar</button>
                    </div>
                  )}
                  {pago.metodo === "plin_directo" && t.plin_numero && (
                    <div className="rounded-2xl bg-crema/70 p-4">
                      <p className="text-xs text-gris">Plin</p>
                      <p className="font-display text-2xl font-extrabold text-tinta">{t.plin_numero}</p>
                      <button onClick={() => copiar(t.plin_numero)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-pino"><Copy className="size-3.5" /> Copiar</button>
                    </div>
                  )}
                  <div className="rounded-2xl bg-crema/70 p-4">
                    <p className="text-xs text-gris">Titular</p>
                    <p className="font-bold text-tinta">{t.pago_titular || t.nombre}</p>
                    <p className="mt-1 text-xs text-gris">Verifica que aparezca este nombre antes de pagar.</p>
                  </div>
                  {t.pago_qr_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.pago_qr_url} alt="QR de pago de la tienda" className="mx-auto size-40 rounded-2xl object-contain ring-1 ring-linea" />
                  )}
                </div>

                {puede("enviar_comprobante") && (
                  <div className="mt-4 space-y-3 border-t border-linea pt-4">
                    <p className="text-sm font-semibold text-tinta">Envía tu comprobante</p>
                    <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => subirCaptura(e.target.files?.[0])} />
                    <Boton variante="secundario" cargando={ocupado === "captura"} onClick={() => archivo.current?.click()}>
                      <ImagePlus className="size-4" /> {captura ? "Cambiar captura" : "Subir captura del pago"}
                    </Boton>
                    {captura && <p className="text-xs text-ok">✓ {captura.nombre}</p>}
                    <Campo etiqueta="N.° de operación (opcional)">
                      <Entrada value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} />
                    </Campo>
                    <Boton
                      onClick={() => hacer("comprobante", () => api.post(`/seguimiento/${token}/comprobante`, { comprobante_key: captura?.key ?? "", referencia: ref.trim() })).then((ok) => ok && (setCaptura(null), setRef("")))}
                      cargando={ocupado === "comprobante"}
                      disabled={!captura && ref.trim().length < 4}
                    >
                      Enviar a la tienda
                    </Boton>
                  </div>
                )}
              </Seccion>
            )}

            {pagarAlRecibir && pago && (
              <Seccion titulo={pago.estado === "adelanto_informado" ? "Adelanto recibido" : "Pagas al recibir"}>
                <p className="text-sm text-gris">
                  {pago.estado === "adelanto_informado" && <>La tienda confirmó tu adelanto. </>}
                  Al recibir tu pedido, paga <b className="text-tinta">{soles(montoAlRecibir)}</b> por {pago.metodo === "plin_directo" ? "Plin" : "Yape"} al{" "}
                  <b className="text-tinta">{pago.metodo === "plin_directo" ? t.plin_numero : t.yape_numero}</b>
                  {t.pago_titular && <> ({t.pago_titular})</>}. La tienda confirma que le llegó y recién ahí das tu código. No se acepta efectivo.
                </p>
                {p.entrega === "motorizado" && p.envio_centimos > 0 && <p className="mt-2 text-xs text-gris">El envío ({soles(p.envio_centimos)}) se lo pagas al motorizado aparte.</p>}
              </Seccion>
            )}

            {p.codigo_entrega && !cerrado && p.estado !== "entregado" && (
              <section className="flex items-center gap-4 rounded-[22px] bg-pino-claro p-5 ring-1 ring-pino/20">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-pino text-white"><KeyRound className="size-6" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-pino">Tu código de entrega</p>
                  <p className="font-display text-3xl font-extrabold tracking-[0.3em] text-pino">{p.codigo_entrega}</p>
                  <p className="text-xs text-pino/80">
                    {p.entrega === "recojo" ? "Muéstralo al recoger." : "Dáselo al motorizado solo cuando tengas tu pedido en la mano."}
                    {pagarAlRecibir && " Primero paga por Yape o Plin; cuando la tienda lo confirme, das tu código."}
                  </p>
                </div>
              </section>
            )}

            <Seccion titulo="Cómo va tu pedido">
              <LineaTiempo pedido={p} />
              {p.envio && (p.envio.numero_orden || p.envio.clave_recojo) && (
                <div className="mt-4 rounded-2xl bg-crema/70 p-4 text-sm">
                  <p className="font-bold text-tinta">Datos para recoger en {p.envio.agencia || p.agencia}</p>
                  {p.envio.numero_orden && <p>N.° de orden: <b>{p.envio.numero_orden}</b></p>}
                  {p.envio.clave_recojo && <p>Clave: <b>{p.envio.clave_recojo}</b></p>}
                </div>
              )}
              {puede("confirmar_recibido") && (
                <Boton className="mt-4" cargando={ocupado === "recibido"} onClick={() => hacer("recibido", () => api.post(`/seguimiento/${token}/recibido`))}>
                  <Check className="size-4" /> Ya lo recibí
                </Boton>
              )}
            </Seccion>

            {devoluciones.length > 0 && (
              <Seccion titulo="Devolución de tu pago">
                {devoluciones.map((d, i) => (
                  <div key={i} className="border-b border-linea py-2 text-sm last:border-0">
                    <p className="font-bold text-tinta">{soles(d.monto_centimos)} · {DEVOLUCION[d.estado]}</p>
                    {d.nota && <p className="text-gris">{d.nota}</p>}
                    {d.evidencia_url && <a href={d.evidencia_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-pino">Ver comprobante de la devolución</a>}
                  </div>
                ))}
                <p className="mt-2 text-xs text-gris">La tienda te devuelve el dinero por el mismo medio. Si no lo recibes, escríbele o abre un reclamo.</p>
              </Seccion>
            )}

            {p.reclamo_detalle && (
              <Seccion titulo="Tu reclamo">
                <p className="text-sm text-tinta"><b>{p.reclamo_detalle.motivo_texto}</b> · {p.reclamo_detalle.estado === "a_favor_comprador" ? "Resuelto a tu favor" : p.reclamo_detalle.estado === "a_favor_vendedor" ? "Resuelto a favor de la tienda" : "En revisión"}</p>
                {p.reclamo_detalle.descripcion && <p className="mt-1 text-sm text-gris">{p.reclamo_detalle.descripcion}</p>}
              </Seccion>
            )}
          </div>

          <aside className="space-y-5">
            <Seccion titulo="Resumen">
              {p.items_detalle.map((i, n) => (
                <div key={n} className="flex items-center gap-3 py-2 text-sm">
                  {i.imagen_url ? <img src={i.imagen_url} alt="" className="size-11 rounded-lg object-cover" /> : <span className="size-11 rounded-lg bg-crema" />}
                  <span className="min-w-0 flex-1"><b className="block truncate text-tinta">{i.nombre}</b>{i.variante && <span className="text-xs text-gris">{i.variante} · </span>}<span className="text-xs text-gris">x{i.cantidad}</span></span>
                  <span>{soles(i.precio_centimos * i.cantidad)}</span>
                </div>
              ))}
              <div className="mt-2 space-y-1 border-t border-linea pt-2 text-sm">
                <div className="flex justify-between"><span className="text-gris">Envío</span><span>{p.envio_centimos ? (p.entrega === "motorizado" ? `${soles(p.envio_centimos)} al motorizado` : soles(p.envio_centimos)) : "—"}</span></div>
                <div className="flex justify-between font-display text-lg font-extrabold"><span>Total a la tienda</span><span>{soles(p.total_centimos)}</span></div>
                {pago?.momento === "adelanto" && <div className="flex justify-between text-xs text-gris"><span>Adelanto · resto al recibir</span><span>{soles(pago.adelanto_centimos)} · {soles(pago.monto_centimos - pago.adelanto_centimos)}</span></div>}
              </div>
              {pago && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gris">
                  <EtiquetaPago estado={pago.estado} texto={pago.texto} /> {pago.metodo_texto} · {pago.momento === "antes" ? "completo antes del envío" : pago.momento === "adelanto" ? "adelanto y resto al recibir" : "al recibir"}
                </div>
              )}
            </Seccion>

            {puede("reclamar") && (
              <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
                <p className="text-sm text-gris">¿Algo salió mal? Tienes 7 días desde la entrega para reclamar. VendiGo revisa el caso con ambas partes.</p>
                <Boton variante="secundario" className="mt-3" onClick={() => setReclamar(true)}><Flag className="size-4" /> Abrir un reclamo</Boton>
              </section>
            )}

            <p className="flex gap-2 px-1 text-xs text-gris">
              <ShieldCheck className="size-4 shrink-0 text-pino" />
              <span>VendiGo no recibe tu dinero: le pagas a la tienda. Te damos el seguimiento y mediamos si hay un reclamo.</span>
            </p>
          </aside>
        </div>
        <PieLegal className="mt-10 border-t border-linea pt-6" />
      </main>

      <Modal abierto={reclamar} onCerrar={() => setReclamar(false)} titulo="Abrir un reclamo">
        <div className="space-y-4">
          <Campo etiqueta="¿Qué pasó?">
            <Selector value={rec.motivo} onChange={(e) => setRec({ ...rec, motivo: e.target.value })}>
              <option value="">Elige</option>
              {Object.entries(MOTIVOS)
                .filter(([k]) => !(k === "no_llego" && pago?.estado === "paga_al_recibir"))
                .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Selector>
          </Campo>
          <Area value={rec.descripcion} onChange={(e) => setRec({ ...rec, descripcion: e.target.value })} placeholder="Cuéntanos con detalle (mínimo 10 caracteres)" maxLength={1000} />
          <div>
            <input ref={fotos} type="file" accept="image/*" multiple hidden onChange={(e) => subirFotos(e.target.files)} />
            <Boton variante="secundario" tamano="sm" cargando={ocupado === "fotos"} disabled={rec.fotos.length >= 5} onClick={() => fotos.current?.click()}>
              <ImagePlus className="size-4" /> Agregar fotos ({rec.fotos.length}/5)
            </Boton>
          </div>
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => setReclamar(false)}>Cancelar</Boton>
            <Boton
              cargando={ocupado === "reclamo"}
              disabled={!rec.motivo || rec.descripcion.trim().length < 10}
              onClick={() => hacer("reclamo", () => api.post(`/seguimiento/${token}/reclamo`, { motivo: rec.motivo, descripcion: rec.descripcion.trim(), fotos: rec.fotos })).then((ok) => ok && setReclamar(false))}
            >
              Enviar reclamo
            </Boton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
