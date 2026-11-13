"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { Check, ChevronRight, Copy, CreditCard, ExternalLink, Flag, ImagePlus, KeyRound, MessageCircle, ShieldCheck } from "lucide-react";
import { api, ErrorApi, useApi, usuarioActual } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import type { PedidoDetalle, Reclamo } from "@/lib/tipos";
import { Area, Aviso, Boton, Campo, Cargando, Entrada, Modal, Selector, useAvisar } from "@/components/ui";
import { LineaTiempo } from "@/components/pedidos/pasos";
import { DEVOLUCION, EtiquetaPago } from "@/components/pagos/estado";
import { CabeceraPublica } from "@/components/tienda/cabecera";
import { PieLegal } from "@/components/legal/pie";

type TiendaPago = {
  nombre: string; slug: string; whatsapp: string;
  yape_numero: string; plin_numero: string; pago_titular: string; pago_qr_url: string; plin_qr_url: string;
  tarjeta_link: string; tarjeta_marcas: string[];
  transf_banco: string; transf_cuenta: string; transf_cci: string; transf_titular: string;
};

const MARCA: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", diners: "Diners Club" };

function Dato({ k, v, copiar, grande }: { k: string; v: string; copiar?: (v: string) => void; grande?: boolean }) {
  return (
    <div className="rounded-2xl bg-crema/70 p-4">
      <p className="text-xs text-gris">{k}</p>
      <p className={grande ? "font-display text-2xl font-extrabold text-tinta" : "break-all font-bold text-tinta"}>{v}</p>
      {copiar && <button onClick={() => copiar(v)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-pino"><Copy className="size-3.5" /> Copiar</button>}
    </div>
  );
}

// Datos para pagarle a la tienda según el método que eligió el comprador.
function DatosPago({ metodo, t, monto, copiar }: { metodo: string; t: TiendaPago; monto: number; copiar: (v: string) => void }) {
  if (metodo === "mercadopago") return null; // se paga con el botón de Mercado Pago (más abajo)
  if (metodo === "tarjeta_tienda" && t.tarjeta_link) {
    return (
      <div className="mt-3 rounded-2xl bg-crema/70 p-4">
        <p className="text-xs text-gris">Tarjeta{t.tarjeta_marcas?.length ? ` · ${t.tarjeta_marcas.map((m) => MARCA[m] ?? m).join(", ")}` : ""}</p>
        <p className="text-sm text-tinta">Paga con el link de pago de {t.nombre}. El cobro lo hace la tienda, no VendiGo.</p>
        <a href={t.tarjeta_link} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex">
          <Boton tamano="sm"><CreditCard className="size-4" /> Pagar {soles(monto)} con tarjeta <ExternalLink className="size-3.5" /></Boton>
        </a>
      </div>
    );
  }
  if (metodo === "transferencia_tienda") {
    return (
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Dato k="Banco" v={t.transf_banco} />
        <Dato k="Titular" v={t.transf_titular} />
        {t.transf_cuenta && <Dato k="N.° de cuenta" v={t.transf_cuenta} copiar={copiar} />}
        {t.transf_cci && <Dato k="CCI (desde otro banco)" v={t.transf_cci} copiar={copiar} />}
      </div>
    );
  }
  const plin = metodo === "plin_directo";
  const numero = plin ? t.plin_numero : t.yape_numero;
  const qr = plin ? t.plin_qr_url : t.pago_qr_url;
  if (!numero) return null;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <Dato k={plin ? "Plin" : "Yape"} v={numero} copiar={copiar} grande />
      <div className="rounded-2xl bg-crema/70 p-4">
        <p className="text-xs text-gris">Titular</p>
        <p className="font-bold text-tinta">{t.pago_titular || t.nombre}</p>
        <p className="mt-1 text-xs text-gris">Verifica que aparezca este nombre antes de pagar.</p>
      </div>
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt={`QR de ${plin ? "Plin" : "Yape"} de la tienda`} className="mx-auto size-40 rounded-2xl object-contain ring-1 ring-linea sm:col-span-2" />
      )}
    </div>
  );
}

const ENTREGA: Record<string, string> = { recojo: "Recojo en tienda", agencia: "Envío por agencia", motorizado: "Delivery con motorizado" };
type Datos = { pedido: PedidoDetalle; tienda: TiendaPago };

const MOTIVOS: Record<string, string> = { no_llego: "No me llegó", danado: "Llegó dañado", distinto: "Es distinto a lo publicado", incompleto: "Llegó incompleto", otro: "Otro problema" };

// Lo único que ve el comprador de su reclamo: en qué va y qué sigue (sin la lógica interna de plazos o fondos).
function estadoReclamo(rc: Reclamo): { titulo: string; sigue: string } {
  const respondio = !!rc.respondido_en;
  switch (rc.estado) {
    case "abierto": {
      const limite = new Date(new Date(rc.creado_en).getTime() + 48 * 3600 * 1000);
      return { titulo: "Enviado a la tienda", sigue: `La tienda tiene hasta el ${fecha(limite.toISOString(), true)} para responder. Te avisaremos por SMS.` };
    }
    case "en_revision":
      return respondio
        ? { titulo: "La tienda respondió · VendiGo revisa", sigue: "VendiGo revisa las pruebas de ambos y te avisará por SMS con la decisión." }
        : { titulo: "En revisión de VendiGo", sigue: "La tienda no respondió a tiempo. VendiGo revisa tu caso y te avisará por SMS." };
    case "a_favor_comprador":
      return { titulo: "Resuelto a tu favor", sigue: rc.motivo === "pago_no_reconocido" && rc.respuesta_vendedor?.includes("reconoció") ? "La tienda reconoció tu pago y sigue con tu pedido." : "Si te corresponde una devolución, verás aquí cuando la tienda la informe." };
    case "a_favor_vendedor":
      return { titulo: "Resuelto a favor de la tienda", sigue: "Si no estás de acuerdo, puedes registrar tu caso en el Libro de Reclamaciones." };
  }
  return { titulo: "En revisión", sigue: "Te avisaremos por SMS." };
}

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
  const [nuevo, setNuevo] = useState(false);
  // Recién creado: lo marca el checkout (la URL puede actualizarse después del primer render).
  useEffect(() => {
    let marca = false;
    try {
      marca = sessionStorage.getItem(`vendigo:nuevo:${token}`) === "1";
    } catch {}
    setNuevo(marca || new URLSearchParams(window.location.search).get("nuevo") === "1");
  }, [token]);
  const { datos, error, recargar } = useApi<Datos>(`/seguimiento/${token}`);
  // Sin sesión se le ofrece crear su cuenta (opcional) para ver todas sus compras juntas.
  const [conCuenta, setConCuenta] = useState<boolean | null>(null);
  useEffect(() => {
    usuarioActual().then((u) => setConCuenta(!!u));
  }, []);
  const avisar = useAvisar();
  // Volvió de Mercado Pago (?payment_id=…): se pide revisar el pago en la API sin esperar el aviso (webhook).
  useEffect(() => {
    const pago = new URLSearchParams(window.location.search).get("payment_id");
    if (!pago) return;
    api.post(`/seguimiento/${token}/mercadopago/verificar`, { payment_id: pago }).catch(() => null).finally(() => recargar());
    window.history.replaceState(null, "", window.location.pathname);
  }, [token, recargar]);
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
          <>
            <ol className="flex flex-wrap items-center gap-2 text-sm">
              {["Tu pedido", "Entrega", "Pago", "Listo"].map((n, k) => (
                <li key={n} className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-pino text-white"><Check className="size-3.5" /></span>
                  <span className={k === 3 ? "font-bold text-tinta" : "text-gris"}>{n}</span>
                  {k < 3 && <span className="mx-1 h-0.5 w-10 rounded-full bg-pino sm:w-16" />}
                </li>
              ))}
            </ol>
            <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
              <div className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-pino text-white"><Check className="size-7" /></span>
                <div>
                  <h1 className="text-[28px] font-extrabold leading-tight text-tinta">Pedido {p.codigo}</h1>
                  <p className="text-sm text-gris">Enviado a {t.nombre}. Te avisaremos por SMS en cada paso.</p>
                </div>
              </div>
              {pago && <div className="mt-3"><EtiquetaPago estado={pago.estado} texto={pago.texto} /></div>}
              <p className="mt-4 rounded-xl bg-crema/70 px-4 py-3 text-sm text-tinta">
                Guarda este enlace: es la única forma de ver tu pedido (no necesitas cuenta).{" "}
                <button onClick={() => copiar(window.location.href.replace("?nuevo=1", ""))} className="inline-flex items-center gap-1 font-bold text-pino"><Copy className="size-3.5" /> Copiar enlace</button>
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="#seguimiento"><Boton>Ver mi pedido</Boton></a>
                <Link href={`/t/${t.slug}`}><Boton variante="secundario">Seguir comprando</Boton></Link>
              </div>
            </section>
          </>
        )}

        {conCuenta === false && (
          <section className="flex flex-wrap items-center gap-4 rounded-[22px] bg-pino p-5 text-white">
            <div className="min-w-0 flex-1">
              <b className="block text-lg">Crea tu cuenta y ten todas tus compras en un solo lugar</b>
              <p className="text-sm text-white/80">Es opcional. Usa este mismo celular y verás este pedido y los siguientes en «Mis pedidos», sin guardar enlaces.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/registro?${new URLSearchParams({ tipo: "comprar", nombre: p.comprador, celular: p.comprador_celular ?? "", siguiente: "/mi-cuenta/pedidos" })}`} className="inline-flex h-11 items-center rounded-full bg-coral px-5 text-sm font-bold text-white">
                Crear mi cuenta
              </Link>
              <Link href={`/ingresar?siguiente=${encodeURIComponent("/mi-cuenta/pedidos")}`} className="inline-flex h-11 items-center rounded-full bg-white/10 px-5 text-sm font-bold text-white ring-1 ring-white/30">
                Ya tengo cuenta
              </Link>
            </div>
          </section>
        )}
        {conCuenta && (
          <Link href="/mi-cuenta/pedidos" className="inline-flex items-center gap-1 text-sm font-bold text-pino hover:underline">
            <ChevronRight className="size-4 rotate-180" /> Mis pedidos
          </Link>
        )}

        <div id="seguimiento" className="flex flex-wrap items-end justify-between gap-3 pt-2">
          <div>
            <nav className="mb-3 flex items-center gap-1.5 text-sm text-gris">
              <Link href={`/t/${t.slug}`} className="hover:text-tinta">{t.nombre}</Link> <ChevronRight className="size-3.5" /> <span>{p.codigo}</span> <ChevronRight className="size-3.5" /> <span className="text-tinta">Seguimiento</span>
            </nav>
            <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
            <h1 className="text-[34px] font-extrabold leading-tight text-pino">Seguimiento de {p.codigo}</h1>
            <p className="text-sm text-gris">{ENTREGA[p.entrega] ?? p.entrega} · {t.nombre} · {fecha(p.creado_en, true)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-tinta ring-1 ring-linea"><span className="size-1.5 rounded-full bg-pino" /> {p.estado_texto}</span>
            {t.whatsapp && (
              <a href={`https://wa.me/51${t.whatsapp}`} target="_blank" rel="noreferrer">
                <Boton variante="secundario" tamano="sm"><MessageCircle className="size-4" /> Escribir a la tienda</Boton>
              </a>
            )}
          </div>
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
                    Paga <b className="text-tinta">{soles(montoAhora)}</b>{esAdelanto && <> de adelanto (el resto, {soles(pago.monto_centimos - montoAhora)}, al recibir)</>} directo a {t.nombre}. VendiGo no recibe este dinero.
                  </p>
                )}
                {pago.estado === "pendiente" && p.del_live && p.estado !== "cancelado" && p.estado !== "rechazado" && (
                  <ContadorPago segundos={p.segundos_para_pagar} alTerminar={recargar} />
                )}
                {pago.estado === "pendiente" && p.pago_vence_en && !p.del_live && p.estado !== "cancelado" && p.estado !== "rechazado" && (
                  <p className="mt-2 rounded-xl bg-aviso-claro px-3 py-2 text-sm text-tinta">
                    Tienes hasta el <b>{fecha(p.pago_vence_en, true)}</b> para pagar y subir tu captura. Si no, el pedido se cancela solo y el producto vuelve a la tienda.
                  </p>
                )}
                <DatosPago metodo={pago.metodo} t={t} monto={montoAhora} copiar={copiar} />

                {puede("pagar_mercadopago") && (
                  <div className="mt-4 space-y-2 border-t border-linea pt-4">
                    <Boton cargando={ocupado === "mp"} onClick={() => hacer("mp", async () => { const r = await api.post<{ url: string }>(`/seguimiento/${token}/mercadopago`, {}); window.location.href = r.url; })}>
                      <CreditCard className="size-4" /> Pagar {soles(montoAhora)} con Mercado Pago
                    </Boton>
                    <p className="text-xs text-gris">Pagas con tarjeta o PagoEfectivo en Mercado Pago. El dinero va directo a {t.nombre} y el pago se confirma solo: no necesitas subir captura.</p>
                  </div>
                )}
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
                  Al recibir tu pedido, paga <b className="text-tinta">{soles(montoAlRecibir)}</b> con estos datos. La tienda confirma que le llegó y recién ahí das tu código. No se acepta efectivo.
                </p>
                <DatosPago metodo={pago.metodo} t={t} monto={montoAlRecibir} copiar={copiar} />
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
              {p.envio && p.entrega === "agencia" && (p.envio.numero_orden || p.envio.clave_recojo || p.envio.enlace_rastreo) && (
                <DatosRecojo agencia={p.envio.agencia || p.agencia} guia={p.envio.numero_orden} clave={p.envio.clave_recojo} rastreo={p.envio.enlace_rastreo} />
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
                <p className="text-sm text-tinta"><b>{p.reclamo_detalle.motivo_texto}</b> · {estadoReclamo(p.reclamo_detalle).titulo}</p>
                <p className="mt-1 text-sm text-gris">{estadoReclamo(p.reclamo_detalle).sigue}</p>
                {p.reclamo_detalle.estado === "a_favor_vendedor" && (
                  <Link href="/libro-reclamaciones" className="mt-2 inline-block text-sm font-semibold text-pino underline">Libro de Reclamaciones</Link>
                )}
              </Seccion>
            )}
          </div>

          <aside className="space-y-5">
            <Seccion titulo="Resumen">
              {p.items_detalle.map((i, n) => (
                <div key={n} className="flex items-center gap-3 py-2 text-sm">
                  {i.imagen_url ? <span className="casilla-producto block size-11 shrink-0 overflow-hidden rounded-lg"><img src={i.imagen_url} alt="" className="foto-producto" /></span> : <span className="size-11 rounded-lg bg-crema" />}
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

            {puede("reclamar_pago") && (
              <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
                <p className="text-sm text-gris">¿Pagaste y la tienda no reconoce tu pago? Abre un reclamo: tu comprobante se adjunta solo y VendiGo revisa el caso con ambas partes.</p>
                <Boton variante="secundario" className="mt-3" onClick={() => { setRec({ motivo: "pago_no_reconocido", descripcion: "", fotos: [] }); setReclamar(true); }}><Flag className="size-4" /> Reclamar mi pago</Boton>
              </section>
            )}

            {puede("reclamar") && (
              <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
                <p className="text-sm text-gris">¿Algo salió mal? Tienes 7 días desde la entrega para reclamar. VendiGo revisa el caso con ambas partes.</p>
                <Boton variante="secundario" className="mt-3" onClick={() => { if (rec.motivo === "pago_no_reconocido") setRec({ ...rec, motivo: "" }); setReclamar(true); }}><Flag className="size-4" /> Abrir un reclamo</Boton>
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
          {rec.motivo === "pago_no_reconocido" ? (
            <p className="rounded-2xl bg-crema/70 px-4 py-3 text-sm text-tinta"><b>Pagué y la tienda no reconoce mi pago.</b> Tu comprobante va adjunto. Cuéntanos cuándo y por qué medio pagaste.</p>
          ) : (
          <Campo etiqueta="¿Qué pasó?">
            <Selector value={rec.motivo} onChange={(e) => setRec({ ...rec, motivo: e.target.value })}>
              <option value="">Elige</option>
              {Object.entries(MOTIVOS)
                .filter(([k]) => !(k === "no_llego" && pago?.estado === "paga_al_recibir"))
                .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Selector>
          </Campo>
          )}
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

// Datos para recoger en la agencia. La clave queda oculta hasta que la compradora la pide, por si alguien
// mira su pantalla; solo se ve en este enlace privado.
function DatosRecojo({ agencia, guia, clave, rastreo }: { agencia: string; guia: string; clave: string; rastreo: string }) {
  const [verClave, setVerClave] = useState(false);
  return (
    <div className="mt-4 space-y-1.5 rounded-2xl bg-crema/70 p-4 text-sm">
      <p className="font-bold text-tinta">Datos para recoger en {agencia}</p>
      {guia && <p>N.° de guía: <b>{guia}</b></p>}
      {clave && (
        <p className="flex items-center gap-2">
          Clave de recojo: {verClave ? <b>{clave}</b> : <b>••••</b>}
          <button type="button" className="text-xs font-semibold text-pino underline" onClick={() => setVerClave((v) => !v)}>{verClave ? "Ocultar" : "Ver clave"}</button>
        </p>
      )}
      {rastreo ? (
        <a href={rastreo} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-pino underline">
          <ExternalLink className="size-4" /> Ver el rastreo en {agencia}
        </a>
      ) : (
        guia && <p className="text-gris">Puedes consultar el estado en la web o app de {agencia} con tu número de guía.</p>
      )}
    </div>
  );
}

// Contador de una separación del Modo live. Los segundos vienen del servidor (que es quien decide el vencimiento);
// el navegador solo los muestra. Al llegar a cero vuelve a preguntar al servidor cómo quedó el pedido.
function ContadorPago({ segundos, alTerminar }: { segundos: number; alTerminar: () => void }) {
  const [quedan, setQuedan] = useState(segundos);
  useEffect(() => setQuedan(segundos), [segundos]);
  useEffect(() => {
    const t = setInterval(() => setQuedan((s) => Math.max(0, s - 1)), 1000);
    // Cada 15 s y al volver a la pestaña se sincroniza con el servidor (por si se perdió internet o se cerró la página).
    const r = setInterval(alTerminar, 15000);
    const volver = () => document.visibilityState === "visible" && alTerminar();
    document.addEventListener("visibilitychange", volver);
    return () => {
      clearInterval(t);
      clearInterval(r);
      document.removeEventListener("visibilitychange", volver);
    };
  }, [alTerminar]);
  useEffect(() => {
    if (quedan === 0) alTerminar();
  }, [quedan, alTerminar]);
  return (
    <div className="mt-3 rounded-2xl bg-coral-claro/70 px-4 py-3 text-center ring-1 ring-coral/30">
      <p className="text-xs font-semibold text-tinta">Separado para ti. Paga y sube tu captura antes de que termine:</p>
      <p className="font-display text-4xl font-extrabold tabular-nums text-coral">{Math.floor(quedan / 60)}:{String(quedan % 60).padStart(2, "0")}</p>
      <p className="text-xs text-gris">Si no pagas a tiempo, se libera para otra persona. Separar no es pagar.</p>
    </div>
  );
}
