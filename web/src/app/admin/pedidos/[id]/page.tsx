"use client";

import Link from "next/link";
import { use } from "react";
import { ArrowRight, Bike, ChevronRight, Flag, Image as Foto, Package, Store } from "lucide-react";
import { useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import { METODO_PAGO, estadoPedidoAdmin } from "@/lib/admin";
import type { PedidoDetalle } from "@/lib/tipos";
import { Cargando } from "@/components/ui";
import { Estado, Tarjeta, Titulo } from "@/components/admin/ui";
import { LineaTiempo } from "@/components/pedidos/pasos";

type Respuesta = { pedido: PedidoDetalle; extra: { tienda_id: string; tienda: string; transaccion: string | null } };

const PAGO: Record<string, string> = { pagado: "Pagado", pendiente: "Pendiente (paga al recibir)", devuelto: "Devuelto al comprador" };
const RECLAMO: Record<string, string> = { abierto: "Abierto", en_revision: "En revisión", a_favor_comprador: "Resuelto a favor del comprador", a_favor_vendedor: "Resuelto a favor de la tienda" };

function Filas({ filas }: { filas: [string, React.ReactNode][] }) {
  return (
    <dl className="space-y-2.5 text-[15px]">
      {filas.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[140px_1fr] gap-3">
          <dt className="text-gris">{k}</dt>
          <dd className="text-tinta">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function DetallePedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos, error } = useApi<Respuesta>(`/admin/pedidos/${id}`);
  if (error && !datos) return <p className="text-sm text-gris">No encontramos este pedido.</p>;
  if (!datos) return <Cargando />;
  const { pedido: p, extra } = datos;
  const est = estadoPedidoAdmin({ ...p, agencia: p.envio?.agencia || p.agencia });
  const e = p.envio;

  const entrega =
    p.entrega === "agencia"
      ? { icono: Package, titulo: `Envío por ${e?.agencia || p.agencia || "agencia"}`, filas: [
          ["Destino", p.agencia_sede || p.ciudad || "—"],
          ["Código de envío", e?.numero_orden ? <b className="font-display tracking-wide">{e.numero_orden}</b> : "Aún no lo registra"],
          ["Clave de recojo", e?.clave_recojo ? "Registrada (solo la ve el comprador)" : "—"],
          ["Enviado el", fecha(p.enviado_en)],
        ] as [string, React.ReactNode][] }
      : p.entrega === "motorizado"
        ? { icono: Bike, titulo: "Delivery con motorizado", filas: [
            ["Dirección", [p.direccion, p.distrito, p.ciudad].filter(Boolean).join(", ") || "—"],
            ["Referencia", p.referencia || "—"],
            ["Lo lleva", e?.motorizado_nombre ? `${e.motorizado_nombre} · ${e.motorizado_celular}` : "Aún no sale"],
            ["Salió el", fecha(p.enviado_en)],
          ] as [string, React.ReactNode][] }
        : { icono: Store, titulo: "Recojo en tienda", filas: [
            ["Recoge", p.comprador],
            ["Código", "Lo muestra el comprador al recoger"],
            ["Entregado el", fecha(p.entregado_en)],
          ] as [string, React.ReactNode][] };
  const IconoEntrega = entrega.icono;

  return (
    <>
      <Titulo
        migas={<><Link href="/admin/pedidos" className="hover:text-pino">Pedidos</Link> <ChevronRight className="size-3.5" /> {p.codigo}</>}
        titulo={`Pedido ${p.codigo}`}
        detalle={
          <span className="inline-flex items-center gap-1.5">
            <Link href={`/admin/tiendas/${extra.tienda_id}`} className="hover:text-pino">{extra.tienda}</Link> <ArrowRight className="size-3.5" /> {p.comprador}
          </span>
        }
        accion={<Estado tono={est.tono}>{est.t}</Estado>}
      />

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Tarjeta titulo="Productos">
            <ul className="divide-y divide-linea">
              {p.items_detalle.map((it, i) => (
                <li key={i} className="flex items-center gap-3 py-3 first:pt-0">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-crema">
                    {it.imagen_url && <img src={it.imagen_url} alt="" onError={(ev) => (ev.currentTarget.style.display = "none")} className="size-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-tinta">{it.nombre}</b>
                    <span className="text-sm text-gris">{[it.variante, `x${it.cantidad}`].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="font-bold text-tinta">{soles(it.precio_centimos * it.cantidad)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1.5 border-t border-linea pt-3 text-[15px]">
              <p className="flex justify-between text-gris"><span>Subtotal</span><span>{soles(p.subtotal_centimos)}</span></p>
              <p className="flex justify-between text-gris"><span>Envío</span><span>{p.envio_centimos ? soles(p.envio_centimos) : "—"}</span></p>
              <p className="flex justify-between pt-1 text-xl font-bold text-tinta"><span>Total</span><span>{soles(p.total_centimos)}</span></p>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Pago">
            <Filas
              filas={[
                ["Método", METODO_PAGO[p.metodo_pago] ?? p.metodo_pago],
                ["Estado", PAGO[p.pago_estado] ?? p.pago_estado],
                ["Transacción", extra.transaccion || "—"],
                ...((p.pago_estado === "devuelto"
                  ? [["Recibe la tienda", "Nada: el dinero volvió al comprador"]]
                  : [
                      ["Comisión pasarela", soles(p.comision_pasarela_centimos)],
                      ["Recibe la tienda", soles(p.neto_centimos)],
                      ["Liberación", p.liberado ? "Ya está disponible para la tienda" : p.liberar_en ? fecha(p.liberar_en, true) : "Cuando se entregue"],
                    ]) as [string, React.ReactNode][]),
              ]}
            />
          </Tarjeta>

          <Tarjeta titulo="Comprador">
            <Filas
              filas={[
                ["Nombre", p.comprador],
                ["Celular", p.comprador_celular],
                ["DNI", p.comprador_dni || "—"],
                ["Fecha del pedido", fecha(p.creado_en, true)],
                ...(p.nota_comprador ? [["Nota", p.nota_comprador] as [string, React.ReactNode]] : []),
              ]}
            />
          </Tarjeta>
        </div>

        <div className="space-y-5">
          <Tarjeta>
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-crema text-tinta"><IconoEntrega className="size-5" /></span>
              <h3 className="text-lg font-bold text-tinta">{entrega.titulo}</h3>
            </div>
            <Filas filas={entrega.filas} />
            {e?.boleta_url && (
              <a href={e.boleta_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-tinta ring-1 ring-linea">
                <Foto className="size-4" /> Ver foto del ticket
              </a>
            )}
            <p className="mt-4 text-xs text-gris">VendiGo no hace el envío: estos datos los registró la tienda.</p>
          </Tarjeta>

          {p.reclamo_detalle && (
            <Tarjeta
              titulo={<span className="inline-flex items-center gap-2"><Flag className="size-5 text-error" /> Reclamo</span>}
              accion={<Link href="/admin/reclamos" className="text-sm font-bold text-pino">Ver reclamos</Link>}
            >
              <Filas
                filas={[
                  ["Motivo", p.reclamo_detalle.motivo_texto],
                  ["Estado", RECLAMO[p.reclamo_detalle.estado] ?? p.reclamo_detalle.estado],
                  ["Detalle", p.reclamo_detalle.descripcion || "—"],
                  ["Respuesta tienda", p.reclamo_detalle.respuesta_vendedor || "Sin respuesta"],
                ]}
              />
            </Tarjeta>
          )}

          <Tarjeta titulo="Estado">
            <LineaTiempo pedido={p} />
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
