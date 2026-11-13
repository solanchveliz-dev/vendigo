"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, Check, ChevronRight, CreditCard, Landmark, Lock, MapPin, Minus, Package, Plus, Smartphone, Store, Trash2 } from "lucide-react";
import { api, ErrorApi, usuarioActual } from "@/lib/api";
import { soles } from "@/lib/formato";
import { diasParaRecoger } from "@/lib/dias-recojo";
import { guardarCarrito, guardarCompraDirecta, guardarSeparacion, leerCarrito, leerCompraDirecta, leerSeparacion, type ItemCarrito } from "@/lib/carrito";
import type { Tienda, Usuario } from "@/lib/tipos";
import type { Direccion } from "@/components/comprador/ui";
import { Area, Aviso, Boton, Campo, Entrada, cn } from "@/components/ui";
import { ElegirSede, type EleccionSede } from "./elegir-sede";

type FormaEntrega = "recojo" | "agencia" | "motorizado";
type Metodo = "yape_directo" | "plin_directo" | "tarjeta_tienda" | "transferencia_tienda" | "mercadopago";
type Paso = 1 | 2 | 3;

const ENTREGAS: Record<FormaEntrega, { t: string; d: string; icono: React.ReactNode }> = {
  recojo: { t: "Recojo en tienda", d: "Pasas por la tienda con tu código.", icono: <Store className="size-5" /> },
  agencia: { t: "Envío por agencia", d: "Recoges en tu agencia con el código que te enviamos.", icono: <Package className="size-5" /> },
  motorizado: { t: "Delivery con motorizado", d: "Te lo llevan a tu dirección.", icono: <Bike className="size-5" /> },
};
const METODO: Record<Metodo, { t: string; d: string; icono: React.ReactNode }> = {
  yape_directo: { t: "Yape", d: "Al número de la tienda", icono: <Smartphone className="size-5" /> },
  plin_directo: { t: "Plin", d: "Al número de la tienda", icono: <Smartphone className="size-5" /> },
  tarjeta_tienda: { t: "Tarjeta", d: "Con el link de pago de la tienda", icono: <CreditCard className="size-5" /> },
  transferencia_tienda: { t: "Transferencia", d: "A la cuenta de la tienda", icono: <Landmark className="size-5" /> },
  mercadopago: { t: "Mercado Pago", d: "Tarjeta o PagoEfectivo · se confirma solo", icono: <CreditCard className="size-5" /> },
};

const MARCA: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", diners: "Diners Club" };

function Pasos({ actual }: { actual: Paso | 4 }) {
  const nombres = ["Tu pedido", "Entrega", "Pago", "Listo"];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {nombres.map((n, i) => {
        const num = i + 1;
        const hecho = num < actual;
        const ahora = num === actual;
        return (
          <li key={n} className="flex items-center gap-2">
            <span className={cn("grid size-6 place-items-center rounded-full text-xs font-bold", hecho || ahora ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea")}>
              {hecho ? <Check className="size-3.5" /> : num}
            </span>
            <span className={cn(ahora ? "font-bold text-tinta" : "text-gris")}>{n}</span>
            {num < 4 && <span className={cn("mx-1 h-0.5 w-10 rounded-full sm:w-16", hecho ? "bg-pino" : "bg-linea")} />}
          </li>
        );
      })}
    </ol>
  );
}

function Tarjeta({ titulo, children, className }: { titulo?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60", className)}>
      {titulo && <h2 className="mb-3 font-extrabold text-tinta">{titulo}</h2>}
      {children}
    </section>
  );
}

// Compra sin cuenta, en 3 pasos como el prototipo: Tu pedido → Entrega → Pago → Listo (seguimiento).
// El comprador le paga directo a la tienda; VendiGo solo registra el pedido y da seguimiento.
// live: separación desde el Modo live (un producto, plazo de pago de minutos y siempre se paga antes).
const CORTO: Record<string, string> = { recojo: "Recojo", agencia: "Agencia", motorizado: "Delivery", otra: "Otra" };

// ahora: "Comprar ahora" de un producto; no toca el pedido que la persona va armando en la tienda.
export function Checkout({ tienda: t, vista = false, live = false, ahora: directa = false, minutosLive = 0 }: { tienda: Tienda; vista?: boolean; live?: boolean; ahora?: boolean; minutosLive?: number }) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>(1);
  const [items, setItems] = useState<ItemCarrito[] | null>(null);
  const [editar, setEditar] = useState(false);
  const entregas = (["recojo", "agencia", "motorizado"] as FormaEntrega[]).filter((e) => t.entrega[e]);
  const metodos = (t.metodos_pago ?? []).filter((m): m is Metodo => m in METODO);
  const [entrega, setEntrega] = useState<FormaEntrega | "">("");
  const [metodo, setMetodo] = useState<Metodo | "">("");
  const [f, setF] = useState({ nombre: "", celular: "", dni: "", direccion: "", distrito: "", ciudad: "", referencia: "", agencia: "", sede: "", nota: "" });
  // Recojo en tienda: el día en que pasará el cliente (como una reserva).
  const [diaRecojo, setDiaRecojo] = useState("");
  const diasRecojo = useMemo(() => diasParaRecoger(t.entrega.dias_recojo), [t.entrega.dias_recojo]);
  const cambiarSede = useCallback((v: EleccionSede) => setF((x) => ({ ...x, agencia: v.agencia, ciudad: v.ciudad, sede: v.sede })), []);
  const [codigo, setCodigo] = useState("");
  // Con la cuenta de comprador abierta: sus datos ya vienen llenos y su celular ya está verificado.
  const [cuenta, setCuenta] = useState<Usuario | null>(null);
  const [direcciones, setDirecciones] = useState<Direccion[]>([]);
  const [enviado, setEnviado] = useState(false);
  const [codigoDev, setCodigoDev] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    setItems(live ? leerSeparacion(t.slug) : directa ? leerCompraDirecta(t.slug) : leerCarrito(t.slug));
  }, [t.slug, live, directa]);
  useEffect(() => {
    usuarioActual().then((u) => {
      if (!u || u.rol === "admin") return;
      setCuenta(u);
      setF((x) => ({ ...x, nombre: x.nombre || u.nombre, celular: x.celular || u.celular }));
      // Sus direcciones guardadas: la principal se llena sola para el delivery.
      fetch("/api/v1/comprador/direcciones", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { direcciones: Direccion[] } | null) => {
          if (!d?.direcciones.length) return;
          setDirecciones(d.direcciones);
          const p = d.direcciones.find((x) => x.principal) ?? d.direcciones[0];
          setF((x) => (x.direccion ? x : { ...x, direccion: p.direccion, distrito: p.distrito, referencia: p.referencia }));
        })
        .catch(() => null);
    });
  }, []);
  const sinCodigo = !!cuenta && f.celular === cuenta.celular;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [paso]);

  // Cuándo se paga lo decide la tienda por forma de entrega (agencia: siempre completo antes).
  const reglaTienda = entrega === "recojo" ? t.entrega.recojo_pago : entrega === "motorizado" ? t.entrega.motorizado_pago : "completo";
  // En el live no hay "pagar al recibir": una separación sin pago no puede retener el producto sin plazo.
  const regla = live && reglaTienda === "al_recibir" ? "completo" : reglaTienda;
  const pct = entrega === "recojo" ? t.entrega.adelanto_pct : entrega === "motorizado" ? t.entrega.motorizado_adelanto_pct : 0;
  const subtotal = useMemo(() => (items ?? []).reduce((a, i) => a + i.precio_centimos * i.cantidad, 0), [items]);
  // El envío del motorizado se le paga a él aparte; no suma al total que se le paga a la tienda.
  const envio = entrega === "agencia" ? t.entrega.costo_agencia_centimos : 0;
  const moto = entrega === "motorizado" ? t.entrega.costo_motorizado_centimos : 0;
  const total = subtotal + envio;
  const adelanto = regla === "adelanto" && pct ? Math.ceil((total * pct) / 100) : 0;
  const ahora = regla === "al_recibir" ? 0 : adelanto || total;

  if (items === null) return <p className="py-10 text-sm text-gris">Cargando tu pedido…</p>;

  if (vista) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-[28px] font-extrabold text-pino">Vista previa</h1>
        <p className="mt-2 text-sm text-gris">Así ven tu tienda tus clientes. Desde la vista previa no se puede comprar.</p>
        <Link href={`/t/${t.slug}?vista=1`} className="mt-5 inline-flex h-11 items-center rounded-full bg-pino px-6 text-sm font-bold text-white">Volver a la tienda</Link>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-[28px] font-extrabold text-pino">{live ? "No tienes nada separado" : "Tu pedido está vacío"}</h1>
        <p className="mt-2 text-sm text-gris">{live ? "Vuelve al live y toca “Separar” en el producto que quieres." : "Elige productos en la tienda y vuelve aquí."}</p>
        <Link href={live ? `/t/${t.slug}/live` : `/t/${t.slug}`} className="mt-5 inline-flex h-11 items-center rounded-full bg-pino px-6 text-sm font-bold text-white">{live ? "Volver al live" : "Ver la tienda"}</Link>
      </div>
    );
  }

  function cambiarItems(nuevos: ItemCarrito[]) {
    setItems(nuevos);
    if (live) guardarSeparacion(t.slug, nuevos);
    else if (directa) guardarCompraDirecta(t.slug, nuevos);
    else guardarCarrito(t.slug, nuevos);
  }
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value }) });

  function revisarEntrega() {
    if (!entrega) return "Elige cómo quieres recibir tu pedido.";
    if (f.nombre.trim().length < 3) return "Escribe tu nombre.";
    if (!/^9\d{8}$/.test(f.celular)) return "Escribe un celular de 9 dígitos que empiece con 9.";
    if (entrega === "motorizado" && !f.direccion.trim()) return "Escribe la dirección de entrega.";
    if (entrega === "recojo" && !diaRecojo) return "Elige qué día irás a recoger tu pedido.";
    if (entrega === "agencia") {
      if (!/^\d{8}$/.test(f.dni)) return "La agencia pide tu DNI (8 dígitos) para entregarte el paquete.";
      if (!f.agencia || !f.sede.trim() || !f.ciudad.trim()) return "Elige la sede de la agencia donde recogerás.";
    }
    return "";
  }

  function siguiente() {
    setError("");
    if (paso === 1) return setPaso(2);
    if (paso === 2) {
      const e = revisarEntrega();
      if (e) return setError(e);
      return setPaso(3);
    }
  }

  async function pedirCodigo() {
    setError("");
    if (!metodo) return setError("Elige cómo vas a pagar.");
    if (sinCodigo) return void confirmar();
    setCargando(true);
    try {
      const r = await api.post<{ mensaje: string; codigo_dev?: string }>("/compras/codigo", { celular: f.celular, slug: t.slug });
      setEnviado(true);
      setCodigoDev(r.codigo_dev ?? "");
    } catch (x) {
      setError((x as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }

  async function confirmar() {
    setError("");
    setCargando(true);
    try {
      const r = await api.post<{ codigo: string; token: string; enlace: string }>("/compras", {
        slug: t.slug,
        items: items!.map((i) => ({ producto_id: i.producto_id, variante_id: i.variante_id, cantidad: i.cantidad })),
        nombre: f.nombre.trim(),
        celular: f.celular,
        codigo: codigo.trim(),
        dni: entrega === "agencia" ? f.dni : "",
        entrega,
        direccion: entrega === "motorizado" ? f.direccion.trim() : "",
        distrito: entrega === "motorizado" ? f.distrito.trim() : "",
        ciudad: entrega === "agencia" ? f.ciudad.trim() : "",
        referencia: entrega === "motorizado" ? f.referencia.trim() : "",
        agencia: entrega === "agencia" ? f.agencia : "",
        agencia_sede: entrega === "agencia" ? f.sede.trim() : "",
        dia_recojo: entrega === "recojo" ? diaRecojo : "",
        metodo_pago: metodo,
        nota: f.nota.trim(),
        live,
      });
      // Solo se vacía lo que se compró: con "Comprar ahora" el pedido guardado sigue intacto.
      if (live) guardarSeparacion(t.slug, []);
      else if (directa) guardarCompraDirecta(t.slug, []);
      else guardarCarrito(t.slug, []);
      try {
        sessionStorage.setItem(`vendigo:nuevo:${r.token}`, "1");
      } catch {}
      router.push(`/seguimiento/${r.token}?nuevo=1`);
    } catch (x) {
      setError((x as ErrorApi).message);
      setCargando(false);
    }
  }

  // Datos de quien recibe, dentro de la tarjeta de la forma de entrega elegida (como en el prototipo).
  const datosEntrega = (
    <div className={cn("grid gap-4", entrega === "agencia" ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                  <Campo etiqueta={entrega === "agencia" ? "Nombre de quien recoge" : "Nombre y apellido"}><Entrada {...campo("nombre")} maxLength={80} autoComplete="name" /></Campo>
                  <Campo etiqueta="Celular" ayuda={sinCodigo ? "Es el celular de tu cuenta: no necesitas código." : cuenta ? "Te enviaremos un código a este número para confirmar." : "Te enviamos un código para confirmar. ¿Tienes cuenta? Ingresa y no te lo pediremos."}><Entrada {...campo("celular")} onChange={(e) => setF({ ...f, celular: e.target.value.replace(/\D/g, "") })} inputMode="numeric" maxLength={9} placeholder="9XXXXXXXX" autoComplete="tel" /></Campo>
                  {entrega === "motorizado" && (
                    <>
                      {direcciones.length > 0 && (
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          {direcciones.map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => setF({ ...f, direccion: d.direccion, distrito: d.distrito, referencia: d.referencia })}
                              className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition", f.direccion === d.direccion ? "bg-pino text-white ring-pino" : "bg-white text-tinta ring-linea hover:ring-pino")}
                            >
                              <MapPin className="size-4" /> {d.etiqueta}
                            </button>
                          ))}
                        </div>
                      )}
                      <Campo etiqueta="Dirección"><Entrada {...campo("direccion")} maxLength={200} autoComplete="street-address" /></Campo>
                      <Campo etiqueta="Distrito"><Entrada {...campo("distrito")} maxLength={80} /></Campo>
                      <Campo etiqueta="Referencia (opcional)"><Entrada {...campo("referencia")} maxLength={200} /></Campo>
                    </>
                  )}
                  {entrega === "agencia" && (
                    <>
                      <Campo etiqueta="DNI" ayuda="La agencia lo pide para entregarte."><Entrada {...campo("dni")} onChange={(e) => setF({ ...f, dni: e.target.value.replace(/\D/g, "") })} inputMode="numeric" maxLength={8} /></Campo>
                      <div className="sm:col-span-3"><ElegirSede agencias={t.entrega.agencias ?? []} valor={{ agencia: f.agencia, ciudad: f.ciudad, sede: f.sede }} cambiar={cambiarSede} /></div>
                    </>
                  )}
                </div>
  );

  const titulos: Record<Paso, [string, string]> = {
    1: [`Tu pedido a ${t.nombre}`, "Revisa y continúa. Son 3 pasos cortos."],
    2: ["¿Cómo quieres recibirlo?", `Opciones que ofrece ${t.nombre}.`],
    3: ["Pago", `Le pagas directo a ${t.nombre}. VendiGo no recibe ni guarda tu dinero.`],
  };
  const migas = ["Mi pedido", "Checkout", ...(paso === 2 ? ["Entrega"] : paso === 3 ? ["Pago"] : [])];
  const tituloPago = regla === "al_recibir" ? "Pagas al recibir" : regla === "adelanto" && adelanto ? `Adelanto para reservar (${pct}%)` : "Pago completo";

  return (
    <>
      <nav className="flex items-center gap-1.5 pt-6 text-sm text-gris">
        <Link href={`/t/${t.slug}`} className="hover:text-tinta">{t.nombre}</Link>
        {migas.map((m) => (
          <span key={m} className="flex items-center gap-1.5"><ChevronRight className="size-3.5" /><span className={m === migas[migas.length - 1] ? "text-tinta" : ""}>{m}</span></span>
        ))}
      </nav>
      <div className="mb-5 mt-4">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">{titulos[paso][0]}</h1>
        <p className="text-sm text-gris">{titulos[paso][1]}</p>
      </div>
      <div className="mb-5"><Pasos actual={paso} /></div>
      {live && (
        <p className="mb-5 rounded-2xl bg-coral-claro/70 px-4 py-3 text-sm text-tinta ring-1 ring-coral/30">
          <b>Separación del live.</b> Al confirmar, el producto queda separado para ti{minutosLive ? <> y tendrás <b>{minutosLive} minutos</b> para pagar y subir tu captura</> : " por unos minutos para que pagues y subas tu captura"}. Si no pagas a tiempo, se libera para otra persona. Separar no es pagar.
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {paso === 1 && (
            <>
              <Tarjeta titulo="Productos">
                {items.map((i, n) => (
                  <div key={i.producto_id + i.variante_id} className="flex items-center gap-3 border-b border-linea py-3 last:border-0">
                    {i.imagen_url ? <span className="casilla-producto block size-12 shrink-0 overflow-hidden rounded-xl"><img src={i.imagen_url} alt="" className="foto-producto" /></span> : <span className="size-12 rounded-xl bg-crema" />}
                    <span className="min-w-0 flex-1 text-sm">
                      <b className="block truncate text-tinta">{i.nombre}</b>
                      <span className="text-xs text-gris">{i.variante ? `${i.variante} · ` : ""}x{i.cantidad}</span>
                    </span>
                    {editar ? (
                      <span className="flex items-center gap-2">
                        <span className="flex h-9 items-center rounded-full bg-white px-1 ring-1 ring-linea">
                          <button aria-label="Menos" className="grid size-7 place-items-center" onClick={() => cambiarItems(items.map((x, k) => (k === n ? { ...x, cantidad: Math.max(1, x.cantidad - 1) } : x)))}><Minus className="size-3.5" /></button>
                          <span className="w-6 text-center text-sm font-semibold">{i.cantidad}</span>
                          <button aria-label="Más" className="grid size-7 place-items-center" onClick={() => cambiarItems(items.map((x, k) => (k === n ? { ...x, cantidad: Math.min(Math.max(1, x.stock), x.cantidad + 1) } : x)))}><Plus className="size-3.5" /></button>
                        </span>
                        <button aria-label="Quitar" className="grid size-8 place-items-center rounded-full ring-1 ring-linea text-gris hover:text-error" onClick={() => cambiarItems(items.filter((_, k) => k !== n))}><Trash2 className="size-4" /></button>
                      </span>
                    ) : (
                      <b className="text-sm text-tinta">{soles(i.precio_centimos * i.cantidad)}</b>
                    )}
                  </div>
                ))}
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <button onClick={() => setEditar(!editar)} className="font-semibold text-pino underline underline-offset-2">{editar ? "Listo" : "Cambiar cantidades"}</button>
                  {directa ? (
                    <span className="text-gris">Compras solo este producto. Lo que tenías en tu pedido de esta tienda sigue guardado.</span>
                  ) : (
                    <Link href={`/t/${t.slug}`} className="font-semibold text-pino underline underline-offset-2">Agregar más de esta tienda</Link>
                  )}
                </div>
              </Tarjeta>
              <Tarjeta>
                <Campo etiqueta={`Nota para ${t.nombre} (opcional)`}>
                  <Area {...campo("nota")} maxLength={300} placeholder="Ej. Es para regalo, por favor sin precio" />
                </Campo>
              </Tarjeta>
            </>
          )}

          {paso === 2 && (
            <>
              {!entregas.length && <Aviso tono="error">Esta tienda todavía no configuró sus formas de entrega.</Aviso>}
              {entregas.map((e) => {
                const activo = entrega === e;
                const precio = e === "recojo" ? "Gratis" : e === "agencia" ? (t.entrega.costo_agencia_centimos ? soles(t.entrega.costo_agencia_centimos) : "Se paga en la agencia") : t.entrega.costo_motorizado_centimos ? `${soles(t.entrega.costo_motorizado_centimos)} al motorizado` : "A coordinar";
                const rEntrega = e === "recojo" ? t.entrega.recojo_pago : e === "motorizado" ? t.entrega.motorizado_pago : "completo";
                const pEntrega = e === "recojo" ? t.entrega.adelanto_pct : e === "motorizado" ? t.entrega.motorizado_adelanto_pct : 0;
                return (
                  <section key={e} className={cn("rounded-[22px] bg-white p-5 ring-1 transition", activo ? "bg-pino-claro/40 ring-2 ring-pino" : "ring-linea/60")}>
                    <button type="button" onClick={() => setEntrega(e)} className="flex w-full items-center gap-3 text-left">
                      <span className={cn("grid size-5 shrink-0 place-items-center rounded-full ring-2", activo ? "ring-pino" : "ring-linea")}>{activo && <span className="size-2.5 rounded-full bg-pino" />}</span>
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", activo ? "bg-pino text-white" : "bg-crema text-tinta")}>{ENTREGAS[e].icono}</span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-sm text-tinta">{ENTREGAS[e].t}</b>
                        <span className="text-xs text-gris">{ENTREGAS[e].d}</span>
                      </span>
                      <b className="text-sm text-tinta">{precio}</b>
                    </button>
                    {activo && (
                      <div className="mt-4 space-y-4 sm:pl-[60px]">
                        {datosEntrega}
                        {e === "recojo" && (
                          <div>
                            <p className="mb-2 text-sm font-bold text-tinta">¿Qué día irás a recogerlo?</p>
                            {diasRecojo.length ? (
                              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Día de recojo">
                                {diasRecojo.map((d) => (
                                  <button
                                    key={d.valor}
                                    type="button"
                                    role="radio"
                                    aria-checked={diaRecojo === d.valor}
                                    onClick={() => setDiaRecojo(d.valor)}
                                    className={cn("w-[88px] rounded-2xl bg-white py-2.5 text-center ring-1 transition", diaRecojo === d.valor ? "ring-2 ring-pino" : "ring-linea hover:ring-pino/50")}
                                  >
                                    <b className="block text-sm text-tinta">{d.titulo}</b>
                                    <span className="text-xs text-gris">{d.fecha}</span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-error">Esta tienda no tiene días de recojo disponibles en las próximas dos semanas.</p>
                            )}
                          </div>
                        )}
                        {e === "recojo" && t.entrega.direccion_recojo && (
                          <p className="flex items-center gap-1.5 text-sm text-tinta"><MapPin className="size-4 shrink-0" /> {t.entrega.direccion_recojo}{t.horario ? ` · ${t.horario}` : ""}</p>
                        )}
                        {e === "motorizado" && t.entrega.zonas_motorizado && <p className="text-sm text-tinta">Zonas: {t.entrega.zonas_motorizado}</p>}
                        <p className="rounded-xl bg-aviso-claro px-4 py-3 text-sm text-tinta">
                          {rEntrega === "al_recibir"
                            ? "Pagas por Yape o Plin al recibir tu pedido."
                            : rEntrega === "adelanto" && pEntrega
                              ? <>Esta tienda pide un <b>adelanto de {pEntrega}%</b> para reservar. El resto lo pagas al recibir.{e === "recojo" && " Si no llegas el día que elegiste, el adelanto queda para la tienda."}</>
                              : "Pagas completo antes de que la tienda prepare tu pedido."}
                          {e === "recojo" && " La tienda tendrá tu pedido listo el día que elijas."}
                          {e === "motorizado" && t.entrega.costo_motorizado_centimos > 0 && " El envío se lo pagas al motorizado aparte."}
                        </p>
                      </div>
                    )}
                  </section>
                );
              })}

            </>
          )}

          {paso === 3 && (
            <>
              <Tarjeta titulo={tituloPago}>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-pino to-pino-2 p-5 text-white">
                  <div>
                    <p className="text-xs text-white/75">{regla === "al_recibir" ? "Pagas al recibir" : adelanto ? "Adelanto ahora" : "Pagas ahora"} · a {t.nombre}</p>
                    <p className="font-display text-3xl font-extrabold">{soles(regla === "al_recibir" ? total : ahora)}</p>
                  </div>
                  <Lock className="size-6 text-white/80" />
                </div>
                <p className="mt-3 flex gap-2 rounded-xl bg-crema/70 px-4 py-3 text-sm text-tinta">
                  <Check className="mt-0.5 size-4 shrink-0 text-pino" />
                  <span>
                    {regla === "al_recibir"
                      ? `Pagas ${soles(total)} cuando recibes tu pedido. La tienda confirma tu pago y recién ahí das tu código de entrega.`
                      : adelanto
                        ? `Después de confirmar verás los datos de la tienda para pagar el adelanto. El resto (${soles(total - adelanto)}) lo pagas al recibir.`
                        : "Después de confirmar verás los datos de la tienda para pagar. Prepara tu pedido cuando confirma tu pago."}
                    {moto > 0 && ` El envío (${soles(moto)}) se lo pagas al motorizado aparte.`}
                  </span>
                </p>
              </Tarjeta>

              <Tarjeta titulo="¿Cómo pagas?">
                {!metodos.length ? (
                  <p className="text-sm text-gris">Esta tienda todavía no configuró cómo recibir pagos. Escríbele antes de pedir.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {metodos.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMetodo(m)}
                        className={cn("flex items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 transition", metodo === m ? "ring-2 ring-pino" : "ring-linea hover:ring-pino/40")}
                      >
                        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", metodo === m ? "bg-pino text-white" : "bg-crema text-tinta")}>{METODO[m].icono}</span>
                        <span className="min-w-0"><b className="block text-sm text-tinta">{METODO[m].t}</b><span className="text-xs text-gris">{m === "tarjeta_tienda" && t.tarjeta_marcas?.length ? t.tarjeta_marcas.map((x) => MARCA[x] ?? x).join(", ") : METODO[m].d}</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </Tarjeta>

              {enviado && (
                <Tarjeta titulo="Confirma tu celular">
                  <Campo etiqueta={`Código enviado al ${f.celular}`} ayuda={codigoDev ? `Modo desarrollo: el código es ${codigoDev}` : "Revisa tus SMS. Vence en unos minutos."}>
                    <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
                  </Campo>
                </Tarjeta>
              )}
            </>
          )}
        </div>

        <aside className="space-y-3 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60 lg:sticky lg:top-24">
          <div className="flex items-center gap-3">
            {t.logo_url ? <img src={t.logo_url} alt="" className="size-10 rounded-full object-cover" /> : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-pino text-xs font-bold text-white">{t.nombre.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase()}</span>}
            <span><b className="block text-sm text-tinta">Pedido a {t.nombre}</b><span className="text-xs text-gris">{t.pago_titular || t.distrito || t.ciudad}</span></span>
          </div>
          <div className="space-y-2 border-b border-linea pb-3">
            {items.map((i) => (
              <div key={i.producto_id + i.variante_id} className="flex items-center gap-2 text-sm">
                {i.imagen_url ? <span className="casilla-producto block size-9 shrink-0 overflow-hidden rounded-lg"><img src={i.imagen_url} alt="" className="foto-producto" /></span> : <span className="size-9 rounded-lg bg-crema" />}
                <span className="min-w-0 flex-1"><b className="block truncate text-xs text-tinta">{i.nombre}</b><span className="text-xs text-gris">x{i.cantidad}{i.variante ? ` · ${i.variante}` : ""}</span></span>
                <span className="text-xs font-semibold">{soles(i.precio_centimos * i.cantidad)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gris">Subtotal</span><span>{soles(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gris">Entrega{entrega ? ` · ${CORTO[entrega] ?? ""}` : ""}</span><span>{!entrega ? "—" : moto ? `${soles(moto)} al motorizado` : envio ? soles(envio) : entrega === "agencia" ? "Se paga en la agencia" : entrega === "recojo" ? "Gratis" : "A coordinar"}</span></div>
            <div className="flex justify-between border-t border-linea pt-2 text-lg font-extrabold"><span>Total</span><span>{soles(total)}</span></div>
            {adelanto > 0 && paso >= 2 && <div className="flex justify-between text-xs text-gris"><span>Adelanto · resto al recibir</span><span>{soles(adelanto)} · {soles(total - adelanto)}</span></div>}
          </div>

          {error && <Aviso tono="error">{error}</Aviso>}

          {paso < 3 ? (
            <Boton bloque tamano="lg" onClick={siguiente} disabled={t.pausada || (paso === 2 && !entregas.length)}>
              {paso === 1 ? "Continuar a entrega" : "Continuar al pago"}
            </Boton>
          ) : !enviado ? (
            <Boton bloque tamano="lg" variante="acento" onClick={pedirCodigo} cargando={cargando} disabled={!metodos.length}>
              {sinCodigo ? <><Lock className="size-4" /> Confirmar y ver cómo pagar</> : "Confirmar pedido"}
            </Boton>
          ) : (
            <Boton bloque tamano="lg" variante="acento" onClick={confirmar} cargando={cargando} disabled={codigo.length < 6}>
              <Lock className="size-4" /> Confirmar y ver cómo pagar
            </Boton>
          )}
          {paso > 1 && (
            <Boton bloque variante="secundario" onClick={() => { setError(""); setEnviado(false); setCodigo(""); setPaso((paso - 1) as Paso); }}>Volver</Boton>
          )}
          {t.pausada && <p className="text-xs text-error">Esta tienda está en pausa y no recibe pedidos por ahora.</p>}
          <p className="text-xs text-gris">Le pagas directo a la tienda por {metodos.map((m) => METODO[m].t).join(", ").replace(/, ([^,]*)$/, " o $1") || "Yape o Plin"}. VendiGo no recibe tu dinero; te da el seguimiento y media si hay un reclamo.</p>
        </aside>
      </div>
    </>
  );
}
