"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Banknote, Bike, ChevronRight, Minus, Package, Plus, ShieldCheck, Smartphone, Store, Trash2 } from "lucide-react";
import { api, ErrorApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { guardarCarrito, leerCarrito, type ItemCarrito } from "@/lib/carrito";
import type { Tienda } from "@/lib/tipos";
import { Aviso, Boton, Campo, Entrada, Selector, cn } from "@/components/ui";

type FormaEntrega = "recojo" | "motorizado" | "agencia";
type Metodo = "yape_directo" | "plin_directo" | "efectivo";

const ENTREGAS: Record<FormaEntrega, { t: string; icono: React.ReactNode }> = {
  recojo: { t: "Recojo en tienda", icono: <Store className="size-5" /> },
  motorizado: { t: "Delivery con motorizado", icono: <Bike className="size-5" /> },
  agencia: { t: "Envío por agencia", icono: <Package className="size-5" /> },
};
const METODO: Record<Metodo, { t: string; icono: React.ReactNode }> = {
  yape_directo: { t: "Yape", icono: <Smartphone className="size-5" /> },
  plin_directo: { t: "Plin", icono: <Smartphone className="size-5" /> },
  efectivo: { t: "Efectivo", icono: <Banknote className="size-5" /> },
};

function Opcion({ activo, onClick, icono, titulo, detalle }: { activo: boolean; onClick: () => void; icono: React.ReactNode; titulo: string; detalle?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 transition", activo ? "ring-2 ring-pino" : "ring-linea hover:ring-pino/40")}
    >
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", activo ? "bg-pino text-white" : "bg-crema text-tinta")}>{icono}</span>
      <span className="min-w-0 flex-1">
        <b className="block text-sm text-tinta">{titulo}</b>
        {detalle && <span className="block text-xs text-gris">{detalle}</span>}
      </span>
    </button>
  );
}

// Compra sin cuenta: el comprador confirma su celular con un código y paga directo a la tienda.
export function Checkout({ tienda: t }: { tienda: Tienda }) {
  const router = useRouter();
  const [items, setItems] = useState<ItemCarrito[] | null>(null);
  const entregas = (["recojo", "motorizado", "agencia"] as FormaEntrega[]).filter((e) => t.entrega[e]);
  const metodos = (t.metodos_pago ?? []) as Metodo[];
  const [entrega, setEntrega] = useState<FormaEntrega | "">(entregas.length === 1 ? entregas[0] : "");
  const [metodo, setMetodo] = useState<Metodo | "">("");
  const [momento, setMomento] = useState<"antes" | "al_recibir">("antes");
  const [f, setF] = useState({ nombre: "", celular: "", dni: "", direccion: "", distrito: "", ciudad: "", referencia: "", agencia: "", sede: "", nota: "" });
  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [codigoDev, setCodigoDev] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => setItems(leerCarrito(t.slug)), [t.slug]);

  // Reglas de la tienda: con agencia se paga antes (Yape o Plin); el efectivo es al recibir.
  const metodosValidos = metodos.filter((m) => !(m === "efectivo" && entrega === "agencia"));
  useEffect(() => {
    if (metodo && !metodosValidos.includes(metodo)) setMetodo("");
  }, [entrega]); // eslint-disable-line react-hooks/exhaustive-deps
  const momentoFinal = metodo === "efectivo" ? "al_recibir" : entrega === "agencia" ? "antes" : momento;

  const subtotal = useMemo(() => (items ?? []).reduce((a, i) => a + i.precio_centimos * i.cantidad, 0), [items]);
  const envio = entrega === "motorizado" ? t.entrega.costo_motorizado_centimos : entrega === "agencia" ? t.entrega.costo_agencia_centimos : 0;

  if (items === null) return <p className="py-10 text-sm text-gris">Cargando tu pedido…</p>;

  function cambiarItems(nuevos: ItemCarrito[]) {
    setItems(nuevos);
    guardarCarrito(t.slug, nuevos);
  }
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) });

  function revisar() {
    if (!items!.length) return "Tu pedido está vacío.";
    if (!entrega) return "Elige cómo quieres recibir tu pedido.";
    if (!metodo) return "Elige cómo vas a pagar.";
    if (f.nombre.trim().length < 3) return "Escribe tu nombre.";
    if (!/^9\d{8}$/.test(f.celular)) return "Escribe un celular de 9 dígitos que empiece con 9.";
    if (entrega === "motorizado" && !f.direccion.trim()) return "Escribe la dirección de entrega.";
    if (entrega === "agencia") {
      if (!/^\d{8}$/.test(f.dni)) return "La agencia pide tu DNI (8 dígitos) para entregarte el paquete.";
      if (!f.agencia || !f.sede.trim() || !f.ciudad.trim()) return "Elige la agencia, la ciudad y la sede donde recogerás.";
    }
    return "";
  }

  async function pedirCodigo() {
    const e = revisar();
    setError(e);
    if (e) return;
    setCargando(true);
    try {
      const r = await api.post<{ mensaje: string; codigo_dev?: string }>("/compras/codigo", { celular: f.celular });
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
        metodo_pago: metodo,
        momento_pago: momentoFinal,
        nota: f.nota.trim(),
      });
      guardarCarrito(t.slug, []);
      router.push(`/seguimiento/${r.token}?nuevo=1`);
    } catch (x) {
      setError((x as ErrorApi).message);
      setCargando(false);
    }
  }

  if (!items.length) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-[28px] font-extrabold text-pino">Tu pedido está vacío</h1>
        <p className="mt-2 text-sm text-gris">Elige productos en la tienda y vuelve aquí.</p>
        <Link href={`/t/${t.slug}`} className="mt-5 inline-flex h-11 items-center rounded-full bg-pino px-6 text-sm font-bold text-white">Ver la tienda</Link>
      </div>
    );
  }

  return (
    <>
      <nav className="flex items-center gap-1.5 py-6 text-sm text-gris">
        <Link href={`/t/${t.slug}`} className="hover:text-tinta">{t.nombre}</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-tinta">Tu pedido</span>
      </nav>
      <div className="mb-6">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[32px] font-extrabold leading-tight text-pino">Tu pedido</h1>
        <p className="text-sm text-gris">No necesitas cuenta. Le pagas directo a {t.nombre} y VendiGo te da el seguimiento.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
            <h2 className="mb-2 text-lg font-extrabold text-tinta">Productos</h2>
            {items.map((i, n) => (
              <div key={i.producto_id + i.variante_id} className="flex items-center gap-3 border-b border-linea py-3 last:border-0">
                {i.imagen_url ? <img src={i.imagen_url} alt="" className="size-14 rounded-xl object-cover" /> : <span className="size-14 rounded-xl bg-crema" />}
                <span className="min-w-0 flex-1 text-sm">
                  <b className="block truncate text-tinta">{i.nombre}</b>
                  {i.variante && <span className="block text-xs text-gris">{i.variante}</span>}
                  <span className="text-xs text-gris">{soles(i.precio_centimos)} c/u</span>
                </span>
                <span className="flex h-9 items-center rounded-full bg-crema px-1">
                  <button aria-label="Menos" className="grid size-7 place-items-center" onClick={() => cambiarItems(items.map((x, k) => (k === n ? { ...x, cantidad: Math.max(1, x.cantidad - 1) } : x)))}><Minus className="size-3.5" /></button>
                  <span className="w-6 text-center text-sm font-semibold">{i.cantidad}</span>
                  <button aria-label="Más" className="grid size-7 place-items-center" onClick={() => cambiarItems(items.map((x, k) => (k === n ? { ...x, cantidad: Math.min(Math.max(1, x.stock), x.cantidad + 1) } : x)))}><Plus className="size-3.5" /></button>
                </span>
                <button aria-label="Quitar" className="text-gris hover:text-error" onClick={() => cambiarItems(items.filter((_, k) => k !== n))}><Trash2 className="size-4" /></button>
              </div>
            ))}
            <Link href={`/t/${t.slug}`} className="mt-2 inline-block text-sm font-semibold text-pino">+ Agregar más productos</Link>
          </section>

          <section className="space-y-3 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
            <h2 className="text-lg font-extrabold text-tinta">¿Cómo lo recibes?</h2>
            {!entregas.length && <p className="text-sm text-gris">Esta tienda todavía no configuró sus formas de entrega.</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              {entregas.map((e) => (
                <Opcion
                  key={e}
                  activo={entrega === e}
                  onClick={() => setEntrega(e)}
                  icono={ENTREGAS[e].icono}
                  titulo={ENTREGAS[e].t}
                  detalle={e === "motorizado" ? (t.entrega.costo_motorizado_centimos ? soles(t.entrega.costo_motorizado_centimos) : "Costo a coordinar") : e === "agencia" ? (t.entrega.costo_agencia_centimos ? soles(t.entrega.costo_agencia_centimos) : "Pagas el envío en la agencia") : "Sin costo"}
                />
              ))}
            </div>
            {entrega === "recojo" && t.entrega.direccion_recojo && <p className="text-sm text-gris">Recoges en: <b className="text-tinta">{t.entrega.direccion_recojo}</b>{t.entrega.horario_recojo && ` · ${t.entrega.horario_recojo}`}</p>}
            {entrega === "motorizado" && t.entrega.zonas_motorizado && <p className="text-sm text-gris">Zonas: {t.entrega.zonas_motorizado}</p>}
          </section>

          <section className="space-y-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
            <h2 className="text-lg font-extrabold text-tinta">Tus datos</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre y apellido"><Entrada {...campo("nombre")} maxLength={80} autoComplete="name" /></Campo>
              <Campo etiqueta="Celular" ayuda="Te enviamos un código para confirmar."><Entrada {...campo("celular")} onChange={(e) => setF({ ...f, celular: e.target.value.replace(/\D/g, "") })} inputMode="numeric" maxLength={9} placeholder="9XXXXXXXX" autoComplete="tel" disabled={enviado} /></Campo>
            </div>
            {entrega === "motorizado" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Dirección"><Entrada {...campo("direccion")} maxLength={200} autoComplete="street-address" /></Campo>
                <Campo etiqueta="Distrito"><Entrada {...campo("distrito")} maxLength={80} /></Campo>
                <Campo etiqueta="Referencia (opcional)"><Entrada {...campo("referencia")} maxLength={200} /></Campo>
              </div>
            )}
            {entrega === "agencia" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="DNI" ayuda="La agencia lo pide para entregarte."><Entrada {...campo("dni")} onChange={(e) => setF({ ...f, dni: e.target.value.replace(/\D/g, "") })} inputMode="numeric" maxLength={8} /></Campo>
                <Campo etiqueta="Agencia">
                  <Selector {...campo("agencia")}>
                    <option value="">Elige</option>
                    {(t.entrega.agencias?.length ? t.entrega.agencias : ["Shalom", "Olva Courier"]).map((a) => <option key={a} value={a}>{a}</option>)}
                  </Selector>
                </Campo>
                <Campo etiqueta="Ciudad"><Entrada {...campo("ciudad")} maxLength={80} /></Campo>
                <Campo etiqueta="Sede donde recoges"><Entrada {...campo("sede")} maxLength={120} placeholder="Ej. Av. Grau 520" /></Campo>
              </div>
            )}
            <Campo etiqueta="Nota para la tienda (opcional)"><Entrada {...campo("nota")} maxLength={300} /></Campo>
          </section>

          <section className="space-y-3 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
            <h2 className="text-lg font-extrabold text-tinta">¿Cómo pagas?</h2>
            {!metodos.length ? (
              <p className="text-sm text-gris">Esta tienda todavía no configuró cómo recibir pagos. Escríbele antes de pedir.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {metodosValidos.map((m) => (
                  <Opcion key={m} activo={metodo === m} onClick={() => setMetodo(m)} icono={METODO[m].icono} titulo={METODO[m].t} detalle={m === "efectivo" ? "Pagas al recibir" : "Directo a la tienda"} />
                ))}
              </div>
            )}
            {metodo && metodo !== "efectivo" && entrega && entrega !== "agencia" && (
              <div className="flex flex-wrap gap-2 text-sm">
                {(["antes", "al_recibir"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setMomento(m)} className={cn("h-9 rounded-full px-4 font-semibold ring-1", momento === m ? "bg-pino text-white ring-pino" : "bg-white text-tinta ring-linea")}>
                    {m === "antes" ? "Pago ahora" : "Pago al recibir"}
                  </button>
                ))}
              </div>
            )}
            {metodo && (
              <p className="text-xs text-gris">
                {momentoFinal === "antes"
                  ? "Después de confirmar verás el número de la tienda para pagar. La tienda prepara tu pedido cuando confirma tu pago."
                  : "Pagas cuando recibes tu pedido. Al entregarlo te pedirán tu código de 4 dígitos."}
              </p>
            )}
          </section>
        </div>

        <aside className="space-y-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60 lg:sticky lg:top-24">
          <h2 className="text-lg font-extrabold text-tinta">Resumen</h2>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gris">Productos</span><span>{soles(subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gris">Envío</span><span>{entrega ? (envio ? soles(envio) : "—") : "Elige la entrega"}</span></div>
            <div className="flex justify-between border-t border-linea pt-2 font-display text-lg font-extrabold"><span>Total</span><span>{soles(subtotal + envio)}</span></div>
            <p className="text-xs text-gris">La tienda confirma el total final al registrar tu pedido.</p>
          </div>

          {error && <Aviso tono="error">{error}</Aviso>}

          {!enviado ? (
            <Boton bloque tamano="lg" onClick={pedirCodigo} cargando={cargando} disabled={t.pausada || !metodos.length || !entregas.length}>
              Continuar
            </Boton>
          ) : (
            <div className="space-y-3">
              <Campo etiqueta={`Código enviado al ${f.celular}`} ayuda={codigoDev ? `Modo desarrollo: el código es ${codigoDev}` : "Revisa tus SMS. Vence en unos minutos."}>
                <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" />
              </Campo>
              <Boton bloque tamano="lg" onClick={confirmar} cargando={cargando} disabled={codigo.length < 6}>Confirmar pedido</Boton>
              <button type="button" onClick={() => { setEnviado(false); setCodigo(""); }} className="w-full text-center text-xs font-semibold text-pino">Cambiar celular o datos</button>
            </div>
          )}
          {t.pausada && <p className="text-xs text-error">Esta tienda está en pausa y no recibe pedidos por ahora.</p>}

          <p className="flex gap-2 text-xs text-gris">
            <ShieldCheck className="size-4 shrink-0 text-pino" />
            <span>VendiGo no recibe tu dinero: le pagas a la tienda. Si algo sale mal, puedes abrir un reclamo desde tu seguimiento.</span>
          </p>
        </aside>
      </div>
    </>
  );
}
