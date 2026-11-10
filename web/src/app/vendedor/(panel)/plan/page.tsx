"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, ReceiptText, ShoppingBag, Sparkles, X, Rocket } from "lucide-react";
import type { PagoPlan, PagoVendiGo } from "@/lib/pagos-plan";
import { PagarAVendiGo } from "@/components/panel/pagar-vendigo";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import type { Creditos, Plan, UsoPlan } from "@/lib/tipos";
import { Boton, Cargando, Modal, cn, useAvisar } from "@/components/ui";

// Beneficios de cada plan: solo lo que VendiGo hace de verdad.
function beneficios(p: Plan): [string, boolean][] {
  const ventas = p.ventas_mes === null ? "Ventas ilimitadas" : `${p.ventas_mes} ventas al mes`;
  const productos = p.productos_max === null ? "Productos ilimitados" : `Hasta ${p.productos_max} productos`;
  const ia = `IA: ${p.creditos_ia.toLocaleString("es-PE")} créditos al mes (≈${Math.floor(p.creditos_ia / 3).toLocaleString("es-PE")} productos con foto)`;
  switch (p.id) {
    case "gratis":
      return [[ventas, true], ["Pedidos con seguimiento", true], [productos, true], [ia, true], ["Estadísticas básicas", true], ["Sugerencias de la semana", false], ["Pronóstico y analista de ventas", false]];
    case "emprende":
      return [[ventas, true], ["Pedidos con seguimiento", true], [productos, true], [ia, true], ["Sugerencias de la semana", true], ["Pronóstico y analista de ventas con IA", true]];
    case "crece":
      return [[ventas, true], ["Todo lo de Emprende", true], [productos, true], [ia, true], ["Sugerencias de la semana completas", true], ["Analítica de 3 meses", true]];
    default:
      return [[ventas, true], ["Todo lo de Crece", true], [productos, true], [ia, true]];
  }
}

const DESCRIPCION: Record<string, string> = {
  gratis: "Para empezar a vender.",
  emprende: "Para la que vende todas las semanas.",
  crece: "Para la que vende todos los días.",
  pro: "Para tiendas grandes.",
};

export default function TuSuscripcion() {
  const uso = useApi<UsoPlan>("/vendedor/plan");
  const planes = useApi<{ planes: Plan[] }>("/planes");
  const ia = useApi<Creditos>("/vendedor/ia");
  const pagos = useApi<{ pagos: PagoPlan[]; pago_vendigo: PagoVendiGo }>("/vendedor/plan/pagos");
  const avisar = useAvisar();
  const [elegido, setElegido] = useState<Plan | null>(null);
  const [extra, setExtra] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const u = uso.datos;
  if (!u || !planes.datos) return <Cargando />;
  const lista = planes.datos.planes;
  const actual = lista.find((p) => p.id === u.plan.id) ?? u.plan;
  const orden = (p: Plan) => lista.findIndex((x) => x.id === p.id);

  async function cambiar() {
    if (!elegido) return;
    setOcupado(true);
    try {
      const nuevo = await api.post<UsoPlan>("/vendedor/plan", { plan_id: elegido.id });
      uso.setDatos(nuevo);
      ia.recargar();
      pagos.recargar();
      avisar(nuevo.plan.id === elegido.id ? `Listo: ahora estás en el plan ${elegido.nombre}.` : `Pedido registrado. Paga ${soles(elegido.precio_centimos)} a VendiGo y activamos tu plan al confirmarlo.`);
      setElegido(null);
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado(false);
    }
  }

  async function comprarExtra() {
    setOcupado(true);
    try {
      uso.setDatos(await api.post<UsoPlan>("/vendedor/plan/ventas-extra"));
      pagos.recargar();
      avisar("Pedido registrado. Paga S/ 5.00 a VendiGo y sumamos tus 20 ventas al confirmarlo.");
      setExtra(false);
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado(false);
    }
  }

  const pct = u.ventas_limite ? Math.min(100, (u.ventas_usadas / u.ventas_limite) * 100) : 0;
  const renueva = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString("es-PE", { day: "numeric", month: "long" });
  const totalIA = ia.datos ? ia.datos.del_plan + ia.datos.extra : 0;
  const subtitulo = `Plan actual: ${actual.nombre}${actual.precio_centimos ? ` · ${soles(actual.precio_centimos).replace(".00", "")} al mes` : " · sin costo"}${
    u.mes_gratis && u.proximo_cobro ? ` · primer mes gratis hasta el ${fecha(u.proximo_cobro)}` : u.proximo_cobro ? ` · próximo cobro el ${fecha(u.proximo_cobro)}` : ""
  }`;
  const pendiente = pagos.datos?.pagos.find((p) => p.estado === "pendiente");
  const sube = elegido && orden(elegido) > orden(actual);
  const gratisMes = elegido && elegido.precio_centimos > 0 && u.puede_mes_gratis;
  const sobran = elegido?.productos_max != null && u.productos_publicados > elegido.productos_max ? u.productos_publicados - elegido.productos_max : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
          <h1 className="text-[34px] font-extrabold leading-tight text-pino">Tu suscripción</h1>
          <p className="text-sm text-gris">{subtitulo}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/vendedor/impulsos">
            <Boton variante="secundario"><Rocket className="size-4" /> Impulsar productos</Boton>
          </Link>
          <Link href="/vendedor/plan/pagos">
            <Boton variante="secundario"><ReceiptText className="size-4" /> Pagos de tu plan</Boton>
          </Link>
        </div>
      </div>

      {pendiente && <PagarAVendiGo key={pendiente.id} concepto={pendiente.concepto} monto={pendiente.monto_centimos} vendigo={pagos.datos?.pago_vendigo ?? null} pagoId={pendiente.id} referenciaInformada={pendiente.referencia_tienda} alListo={pagos.recargar} />}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-extrabold text-tinta"><ShoppingBag className="size-[18px]" /> Ventas este mes</h3>
            <span className="text-xs font-bold text-tinta">● {actual.nombre}{actual.precio_centimos ? ` · ${soles(actual.precio_centimos)} al mes` : ""}</span>
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <b>{u.ventas_limite === null ? `${u.ventas_usadas} ventas · ilimitadas` : `${u.ventas_usadas} de ${u.ventas_limite} ventas`}</b>
            <span className="text-xs text-gris">Se renueva el {renueva}</span>
          </div>
          {u.ventas_limite !== null && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-arena">
              <div className={cn("h-full rounded-full", pct >= 90 ? "bg-coral" : "bg-pino")} style={{ width: `${pct}%` }} />
            </div>
          )}
          <p className="mt-2 text-xs text-gris">
            Cada pedido que aceptas cuenta como 1 venta, tenga los productos que tenga. Los que rechazas no gastan tu cupo.
            {u.ventas_extra > 0 && ` Incluye ${u.ventas_extra} ventas extra.`}
          </p>
          {u.ventas_limite !== null && (
            <div className={cn("mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm", (u.ventas_quedan ?? 0) <= 3 ? "bg-aviso-claro" : "bg-crema")}>
              <span>
                {u.ventas_quedan === 0 ? "Usaste todas tus ventas: no podrás aceptar pedidos nuevos." : (u.ventas_quedan ?? 0) <= 3 ? `Te quedan ${u.ventas_quedan} ventas.` : "¿Te quedas sin cupo antes de fin de mes?"}
              </span>
              <button onClick={() => setExtra(true)} className="font-bold text-pino underline underline-offset-2">+20 ventas por S/ 5</button>
            </div>
          )}
          <p className="mt-3 text-xs text-gris">
            Productos publicados: <b className="text-tinta">{u.productos_publicados}{actual.productos_max != null ? ` de ${actual.productos_max}` : ""}</b>
          </p>
        </section>

        <section className="rounded-[22px] bg-crema p-5 ring-1 ring-linea/60">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-extrabold text-tinta">
              <Sparkles className="mb-1 block size-4" /> Créditos de IA: {ia.datos ? `te quedan ${ia.datos.quedan} de ${totalIA}` : "…"}
            </h3>
            <span className="text-xs text-gris">Se renuevan el {renueva}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-pino" style={{ width: `${totalIA && ia.datos ? (ia.datos.quedan / totalIA) * 100 : 0}%` }} />
          </div>
          <p className="mt-3 text-xs text-gris">Publicar con foto 3 · Leer boleta 2 · Analista de ventas 2 · Post para redes 1</p>
          <Link href="/vendedor/ia" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-pino">Herramientas IA <ArrowRight className="size-3.5" /></Link>
        </section>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {lista.map((p) => {
          const esActual = p.id === actual.id;
          const sube = orden(p) > orden(actual);
          return (
            <div key={p.id} className={cn("flex flex-col rounded-[22px] p-6 shadow-suave ring-1", esActual ? "bg-pino text-white ring-pino" : "bg-white ring-linea/60")}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-xl font-extrabold">{p.nombre}</p>
                {p.id === "emprende" && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", esActual ? "bg-white text-pino" : "bg-arena text-tinta")}>Más elegido</span>}
                {esActual && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold">Tu plan</span>}
              </div>
              <p className="mt-4 font-display text-[40px] font-extrabold leading-none">
                {p.precio_centimos ? soles(p.precio_centimos).replace(".00", "").replace(" ", "") : "S/0"}
                {p.precio_centimos > 0 && <span className={cn("text-sm font-normal", esActual ? "text-white/70" : "text-gris")}>/mes</span>}
              </p>
              <p className={cn("mt-4 text-sm", esActual ? "text-white/80" : "text-gris")}>{DESCRIPCION[p.id]}</p>
              <ul className="my-5 flex-1 space-y-2.5 text-sm">
                {beneficios(p).map(([t, si]) => (
                  <li key={t} className={cn("flex gap-2.5", !si && (esActual ? "text-white/50" : "text-gris"))}>
                    {si ? <Check className={cn("mt-0.5 size-4 shrink-0", esActual ? "text-coral" : "text-tinta")} /> : <X className="mt-0.5 size-4 shrink-0" />} {t}
                  </li>
                ))}
              </ul>
              {esActual ? (
                <button disabled className="h-11 rounded-full bg-white/20 text-sm font-bold text-white/80">Plan actual</button>
              ) : (
                <Boton bloque onClick={() => setElegido(p)}>{sube ? `Mejorar a ${p.nombre}` : `Cambiar a ${p.nombre}`}</Boton>
              )}
            </div>
          );
        })}
      </div>

      <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
        <h3 className="text-lg font-extrabold text-tinta">¿Cómo funcionan los planes?</h3>
        <div className="mt-3 grid gap-6 md:grid-cols-2">
          <p className="text-sm text-tinta">
            Cada plan trae un <b>cupo de ventas al mes</b>, como los créditos de la IA: cada pedido que aceptas cuenta como 1 venta. Si llegas al límite, subes de plan o compras
            +20 ventas por S/ 5. <b>VendiGo no cobra comisión por venta.</b>
            {u.puede_mes_gratis && " El primer mes de tu primer plan de pago es gratis."}
          </p>
          <div className="text-sm">
            <p className="pb-2">Tus ventas y tu plan van por separado:</p>
            <div className="flex justify-between border-t border-linea py-2"><span>Tus clientes te pagan</span><b>Directo a ti (Yape o Plin)</b></div>
            <div className="flex justify-between border-t border-linea py-2"><span>Comisión de VendiGo por venta</span><b>0 %</b></div>
            <div className="flex justify-between border-t border-linea py-2"><span>Tu plan</span><b>Lo pagas a VendiGo</b></div>
            <p className="pt-1 text-xs text-gris">VendiGo no recibe ni guarda el dinero de tus ventas.</p>
          </div>
        </div>
      </section>

      <Modal abierto={!!elegido} onCerrar={() => setElegido(null)} titulo={elegido ? (sube ? `Mejorar a ${elegido.nombre}` : `Cambiar a ${elegido.nombre}`) : ""} ancho="max-w-2xl">
        {elegido && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {[actual, elegido].map((p, i) => (
                <div key={p.id} className={cn("rounded-2xl p-4", i ? "bg-pino-claro" : "bg-crema")}>
                  <p className="text-xs text-gris">{i ? "Nuevo plan" : "Plan actual"}</p>
                  <p className="font-display text-xl font-extrabold text-tinta">{p.nombre}</p>
                  <p className="font-display text-2xl font-extrabold text-tinta">{p.precio_centimos ? `${soles(p.precio_centimos)}/mes` : "Gratis"}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {beneficios(p).filter(([, si]) => si).slice(0, 4).map(([t]) => <li key={t}>· {t}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-aviso-claro px-4 py-3 text-sm text-tinta">
              {elegido.precio_centimos === 0
                ? `Vuelves al plan Gratis hoy: ${elegido.ventas_mes} ventas al mes y sin pronóstico ni analista de ventas.`
                : gratisMes
                  ? `El cambio es inmediato y tu primer mes es gratis. Luego pagas ${soles(elegido.precio_centimos)} al mes a VendiGo (Yape, Plin, tarjeta o transferencia). Puedes cambiar cuando quieras.`
                  : `Pagas ${soles(elegido.precio_centimos)} a VendiGo y tu plan se activa cuando el equipo confirme el pago (te avisamos).`}
              {sobran > 0 && ` Tienes ${u.productos_publicados} productos publicados y este plan permite ${elegido.productos_max}: no podrás publicar nuevos hasta ocultar ${sobran}.`}
            </div>
            <div className="flex flex-wrap gap-2">
              <Boton variante="acento" cargando={ocupado} onClick={cambiar} disabled={!!pendiente && elegido.precio_centimos > 0 && !gratisMes}>{sube ? "Mejorar plan" : "Cambiar plan"}</Boton>
              <Boton variante="secundario" onClick={() => setElegido(null)}>Volver</Boton>
            </div>
          </div>
        )}
      </Modal>

      <Modal abierto={extra} onCerrar={() => setExtra(false)} titulo="¿Comprar 20 ventas más?">
        <p className="text-sm text-gris">Pagas S/ 5.00 a VendiGo y, cuando el equipo confirme el pago, se suman a tu cupo de este mes. Las ventas extra no pasan al mes siguiente.</p>
        <div className="mt-4 flex gap-2">
          <Boton cargando={ocupado} onClick={comprarExtra} disabled={!!pendiente}>Pedir por S/ 5</Boton>
          <Boton variante="secundario" onClick={() => setExtra(false)}>Cancelar</Boton>
        </div>
      </Modal>
    </div>
  );
}
