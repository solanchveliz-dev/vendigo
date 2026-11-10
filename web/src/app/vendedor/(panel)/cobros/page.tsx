"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Clock, Flag, Info, ReceiptText, RefreshCw, ShoppingBag, Smartphone, Truck } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { Boton, Cargando, cn } from "@/components/ui";
import { DEVOLUCION, EtiquetaPago, METODOS } from "@/components/pagos/estado";

type Resumen = {
  vendido_mes_centimos: number;
  pedidos_mes: number;
  vendido_total_centimos: number;
  pedidos_total: number;
  pagos_por_confirmar: number;
  pagos_por_confirmar_centimos: number;
  pagos_al_recibir: number;
  devoluciones_pendientes: number;
  devoluciones_pendientes_centimos: number;
};
type Linea = {
  pedido_id: string;
  codigo: string;
  comprador: string;
  total_centimos: number;
  estado: string;
  pago_estado: string;
  pago_texto: string;
  metodo: string;
  devolucion: keyof typeof DEVOLUCION | null;
  fecha: string;
  entregado_en: string | null;
};
type ReclamoFila = { id: string; pedido_id: string; codigo: string; comprador: string; motivo_texto: string; estado: string; total_centimos: number; creado_en: string };

const FILTROS = [
  { id: "", t: "Todos" },
  { id: "revisar", t: "Pagos por revisar" },
  { id: "entregados", t: "Entregados" },
  { id: "devoluciones", t: "Devoluciones" },
] as const;

const dia = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short" }).replace(".", "");

function Cuadro({ titulo, valor, detalle, icono, oscuro, alerta }: { titulo: string; valor: string; detalle: string; icono: React.ReactNode; oscuro?: boolean; alerta?: boolean }) {
  return (
    <div className={cn("rounded-[22px] p-5 shadow-suave", oscuro ? "bg-pino text-white" : "bg-white ring-1 ring-linea/60", alerta && "ring-2 ring-aviso/50")}>
      <div className="flex items-start justify-between">
        <p className={cn("text-sm", oscuro ? "text-white/80" : "text-gris")}>{titulo}</p>
        <span className={cn("grid size-9 place-items-center rounded-xl", oscuro ? "bg-white/10 text-coral" : "bg-crema text-tinta")}>{icono}</span>
      </div>
      <p className={cn("mt-2 font-display text-3xl font-extrabold", !oscuro && "text-tinta")}>{valor}</p>
      <p className={cn("mt-2 text-xs font-semibold", oscuro ? "text-white/80" : "text-tinta")}>{detalle}</p>
    </div>
  );
}

export default function MisVentas() {
  const { datos } = useApi<{ resumen: Resumen; pedidos: Linea[] }>("/vendedor/ventas");
  const rec = useApi<{ reclamos: ReclamoFila[] }>("/vendedor/reclamos");
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("");
  const [verTodo, setVerTodo] = useState(false);

  const lista = useMemo(() => {
    const p = datos?.pedidos ?? [];
    if (filtro === "revisar") return p.filter((l) => ["pendiente", "comprobante_enviado", "no_recibido"].includes(l.pago_estado) && !["rechazado", "cancelado"].includes(l.estado));
    if (filtro === "entregados") return p.filter((l) => l.estado === "entregado");
    if (filtro === "devoluciones") return p.filter((l) => l.devolucion);
    return p;
  }, [datos, filtro]);

  if (!datos) return <Cargando />;
  const k = datos.resumen;
  const abiertos = rec.datos?.reclamos.filter((r) => r.estado === "abierto" || r.estado === "en_revision") ?? [];
  const visibles = verTodo ? lista : lista.slice(0, 15);

  return (
    <div className="space-y-5">
      <div className="max-w-2xl">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Mis ventas</h1>
        <p className="text-sm text-gris">Tus clientes te pagan directo a ti por Yape, Plin o en efectivo. VendiGo no recibe ni guarda tu dinero: aquí solo llevas la cuenta de lo que vendiste.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cuadro oscuro titulo="Vendido este mes" valor={soles(k.vendido_mes_centimos)} detalle={`${k.pedidos_mes} ${k.pedidos_mes === 1 ? "pedido entregado" : "pedidos entregados"}`} icono={<ShoppingBag className="size-[18px]" />} />
        <Cuadro titulo="Pagos por revisar" valor={String(k.pagos_por_confirmar)} detalle={k.pagos_por_confirmar ? `${soles(k.pagos_por_confirmar_centimos)} · revisa tu Yape o Plin` : "Todo al día"} icono={<Clock className="size-[18px]" />} alerta={k.pagos_por_confirmar > 0} />
        <Cuadro titulo="Pagan al recibir" valor={String(k.pagos_al_recibir)} detalle="Cobras cuando entregas" icono={<Truck className="size-[18px]" />} />
        <Cuadro titulo="Devoluciones pendientes" valor={String(k.devoluciones_pendientes)} detalle={k.devoluciones_pendientes ? `${soles(k.devoluciones_pendientes_centimos)} que debes devolver` : "Ninguna"} icono={<RefreshCw className="size-[18px]" />} alerta={k.devoluciones_pendientes > 0} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-crema/70 px-4 py-3 text-sm text-tinta">
        <Info className="size-4 shrink-0 text-pino" />
        <span className="flex-1">Este es un historial informativo, no un saldo. En total llevas {soles(k.vendido_total_centimos)} en {k.pedidos_total} pedidos entregados. VendiGo no te cobra comisión por venta.</span>
        <Link href="/vendedor/tienda/pagos">
          <Boton tamano="sm" variante="secundario"><Smartphone className="size-4" /> Cómo te pagan</Boton>
        </Link>
      </div>

      {abiertos.length > 0 && (
        <section id="reclamos" className="space-y-3">
          <h2 className="text-lg font-extrabold text-tinta">Reclamos</h2>
          {abiertos.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-[22px] bg-aviso-claro/70 p-5 ring-1 ring-aviso/20">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-pino text-white"><Flag className="size-5" /></span>
              <div className="min-w-[220px] flex-1">
                <p className="font-bold text-tinta">{r.comprador.split(" ")[0]}: “{r.motivo_texto}”</p>
                <p className="text-sm text-tinta/80">
                  {r.codigo} · {soles(r.total_centimos)}{r.estado === "en_revision" ? " · VendiGo está revisando las pruebas" : " · responde con tus pruebas"}.
                </p>
              </div>
              <Link href={`/vendedor/cobros/reclamo/${r.pedido_id}`}>
                <Boton variante={r.estado === "abierto" ? "primario" : "secundario"}>{r.estado === "abierto" ? "Responder" : "Ver reclamo"}</Boton>
              </Link>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-lg font-extrabold text-tinta">Historial de ventas</h2>
          <div className="flex flex-wrap gap-1 rounded-full bg-crema/70 p-1">
            {FILTROS.map((f) => (
              <button key={f.id} onClick={() => setFiltro(f.id)} className={cn("h-8 rounded-full px-3 text-xs font-semibold", filtro === f.id ? "bg-pino text-white" : "text-tinta")}>{f.t}</button>
            ))}
          </div>
        </div>
        <div className="mt-2">
          {!visibles.length ? (
            <p className="py-6 text-sm text-gris">No hay pedidos con este filtro.</p>
          ) : (
            visibles.map((l) => (
              <Link key={l.pedido_id} href={`/vendedor/pedidos/${l.pedido_id}`} className="flex items-center gap-3 border-b border-linea py-3.5 last:border-0 hover:bg-crema/40">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><ReceiptText className="size-4" /></span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block"><b className="text-tinta">{l.comprador}</b> <span className="text-xs text-gris">{l.codigo} · {dia(l.fecha)}</span></span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gris">
                    <EtiquetaPago estado={l.pago_estado} texto={l.pago_texto} />
                    {METODOS[l.metodo] ?? l.metodo}
                    {l.devolucion && l.devolucion !== "de_prueba" && <span className="font-semibold text-error">{DEVOLUCION[l.devolucion]}</span>}
                  </span>
                </span>
                <b className="font-display text-tinta">{soles(l.total_centimos)}</b>
              </Link>
            ))
          )}
        </div>
        {lista.length > 15 && (
          <button onClick={() => setVerTodo(!verTodo)} className="mt-3 text-sm font-semibold text-pino">{verTodo ? "Ver menos" : `Ver los ${lista.length}`}</button>
        )}
      </section>
    </div>
  );
}
