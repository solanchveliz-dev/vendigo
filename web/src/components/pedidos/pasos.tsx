"use client";

import Link from "next/link";
import { Check, Info, Lock, Package, Store, Bike, Truck, Flag, Printer } from "lucide-react";
import { fecha, soles } from "@/lib/formato";
import type { PedidoDetalle } from "@/lib/tipos";
import { Boton, cn } from "@/components/ui";

type Paso = { titulo: string; cliente: string; quien: "cliente" | "tienda"; como: string; fecha: string | null };

// Los 4 pasos de cada pedido según cómo se entrega (los mismos que ve el cliente en su app).
export function pasosPedido(p: PedidoDetalle): { pasos: Paso[]; actual: number; cancelado: boolean } {
  const pagaAlRecibir = p.pago_estado === "pendiente";
  const nombre = p.comprador.split(" ")[0];
  const pasos: Paso[] =
    p.entrega === "agencia"
      ? [
          { titulo: "Pagado y protegido", cliente: "Pagaste con Culqi. Tu dinero queda retenido hasta que recibas tu pedido.", quien: "cliente", como: "Paga con Yape, tarjeta o PagoEfectivo", fecha: p.creado_en },
          { titulo: "Pedido aceptado", cliente: "La tienda está preparando tu pedido.", quien: "tienda", como: "Un toque: “Aceptar pedido”", fecha: p.aceptado_en },
          { titulo: `Enviado por ${p.envio?.agencia || p.agencia || "agencia"}`, cliente: "Recibes el código para recoger en tu agencia.", quien: "tienda", como: "“Ya lo envié” + código o foto", fecha: p.enviado_en },
          { titulo: "Entregado", cliente: "Lo confirmas tú o se confirma solo a los 7 días.", quien: "cliente", como: "Toca “Ya lo recibí” o se confirma solo en 7 días", fecha: p.entregado_en },
        ]
      : p.entrega === "motorizado"
        ? [
            { titulo: pagaAlRecibir ? "Pedido hecho" : "Pagado y protegido", cliente: pagaAlRecibir ? "Pagas cuando lo recibas, desde tu app." : "Pagaste con Culqi. Tu dinero queda retenido hasta que recibas tu pedido.", quien: "cliente", como: pagaAlRecibir ? "Pide y paga al recibir" : "Paga con Yape, tarjeta o PagoEfectivo", fecha: p.creado_en },
            { titulo: "Pedido aceptado", cliente: "La tienda está preparando tu pedido.", quien: "tienda", como: "Un toque: “Aceptar pedido”", fecha: p.aceptado_en },
            { titulo: "En camino", cliente: p.envio?.motorizado_nombre ? `Lo lleva ${p.envio.motorizado_nombre} (${p.envio.motorizado_celular}).` : "Ves quién lo lleva y su celular.", quien: "tienda", como: "“Ya salió” + quién lo lleva", fecha: p.enviado_en },
            { titulo: pagaAlRecibir ? "Entregado y pagado" : "Entregado", cliente: pagaAlRecibir ? "Pagas desde tu app al recibir. Si no llega, no pagas." : "Lo confirmas tú al recibirlo.", quien: "cliente", como: pagaAlRecibir ? "Paga desde su app al recibir" : "Toca “Ya lo recibí”", fecha: p.entregado_en },
          ]
        : [
            { titulo: "Pagado y reservado", cliente: "Pagaste con Culqi. Tu pedido queda reservado.", quien: "cliente", como: "Paga con Yape, tarjeta o PagoEfectivo", fecha: p.creado_en },
            { titulo: "Pedido aceptado", cliente: "La tienda está preparando tu pedido.", quien: "tienda", como: "Un toque: “Aceptar pedido”", fecha: p.aceptado_en },
            { titulo: "Listo para recoger", cliente: "Te avisamos cuando puedas pasar por la tienda.", quien: "tienda", como: "“Ya está listo”", fecha: p.estado === "listo_recojo" || p.estado === "entregado" ? p.eventos.find((e) => e.estado === "listo_recojo")?.fecha ?? null : null },
            { titulo: "Entregado", cliente: `Muestras tu código de 4 dígitos al recoger.`, quien: "tienda", como: `Pide el código a ${nombre} y toca “Entregar”`, fecha: p.entregado_en },
          ];
  const actual = { por_aceptar: 0, preparando: 1, listo_recojo: 2, enviado: 2, entregado: 3 }[p.estado] ?? 0;
  return { pasos, actual, cancelado: p.estado === "rechazado" || p.estado === "cancelado" };
}

// "Lo que ve tu cliente" (modo cliente) o "Quién hace cada paso" (modo roles).
export function LineaTiempo({ pedido, modo = "cliente" }: { pedido: PedidoDetalle; modo?: "cliente" | "roles" }) {
  const { pasos, actual, cancelado } = pasosPedido(pedido);
  return (
    <ol className="relative">
      {pasos.map((s, i) => {
        const hecho = !cancelado && i <= actual;
        const ahora = !cancelado && i === actual && pedido.estado !== "entregado";
        return (
          <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
            {i < pasos.length - 1 && <span className={cn("absolute left-[11px] top-7 h-[calc(100%-24px)] w-0.5", hecho && i < actual ? "bg-pino" : "bg-linea")} />}
            <span
              className={cn(
                "relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                ahora ? "bg-pino text-white ring-4 ring-coral-claro" : hecho ? "bg-pino text-white" : "bg-white ring-2 ring-linea",
              )}
            >
              {ahora ? i + 1 : hecho ? <Check className="size-3.5" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("font-bold", hecho ? "text-tinta" : "text-tinta/80")}>{s.titulo}</p>
              <p className="text-sm text-gris">{modo === "cliente" ? s.cliente : s.como}</p>
              {modo === "cliente" && hecho && s.fecha && <p className="mt-0.5 text-xs text-gris">{fecha(s.fecha, true)}</p>}
            </div>
            {modo === "roles" && (
              <span className={cn("h-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", s.quien === "tienda" ? "bg-aviso-claro text-tinta" : "text-tinta")}>
                {s.quien === "tienda" ? "Tú" : "Tu cliente"}
              </span>
            )}
          </li>
        );
      })}
      {cancelado && (
        <li className="mt-2 rounded-xl bg-error/10 px-4 py-3 text-sm text-error">
          Pedido {pedido.estado === "rechazado" ? "rechazado" : "cancelado"}{pedido.motivo_cancelacion ? `: ${pedido.motivo_cancelacion}` : ""}. Se le devolvió el dinero al cliente.
        </li>
      )}
    </ol>
  );
}

const iconoEntrega = { agencia: Package, motorizado: Bike, recojo: Store };

// Aviso de arriba con lo que le toca hacer al vendedor en este momento.
export function AvisoAccion({
  pedido: p,
  ocupado,
  alAceptar,
  alRechazar,
  alEntregar,
  alResponder,
}: {
  pedido: PedidoDetalle;
  ocupado?: boolean;
  alAceptar: () => void;
  alRechazar: () => void;
  alEntregar: () => void;
  alResponder: () => void;
}) {
  const nombre = p.comprador.split(" ")[0];
  const enviar = `/vendedor/pedidos/${p.id}/enviar`;
  let icono: React.ReactNode = <Truck className="size-5" />;
  let titulo = "";
  let texto: React.ReactNode = "";
  let botones: React.ReactNode = null;
  let tono = "bg-aviso-claro/70 ring-aviso/30";

  if (p.acciones.includes("responder_reclamo")) {
    icono = <Flag className="size-5" />;
    titulo = "Responde el reclamo";
    texto = <>Envía tu prueba (la boleta de envío se adjunta sola). Mientras tanto, el dinero de este pedido queda bloqueado.</>;
    botones = <Link href={`/vendedor/cobros/reclamo/${p.id}`}><Boton variante="acento">Responder reclamo</Boton></Link>;
    tono = "bg-error/10 ring-error/30";
  } else if (p.estado === "por_aceptar") {
    icono = <Lock className="size-5" />;
    titulo = "Acepta el pedido";
    texto = (
      <>
        {nombre} {p.pago_estado === "pendiente" ? "pagará" : "ya pagó"} <b>{soles(p.total_centimos)}</b>{p.pago_estado === "pendiente" ? " al recibir." : " con pago protegido."} Si no puedes atenderlo, se le devuelve todo su dinero.
      </>
    );
    botones = (
      <>
        <Boton variante="secundario" onClick={alRechazar}>No puedo atenderlo</Boton>
        <Boton cargando={ocupado} onClick={alAceptar}>Aceptar pedido</Boton>
      </>
    );
  } else if (p.estado === "preparando") {
    const Icono = iconoEntrega[p.entrega];
    icono = <Icono className="size-5" />;
    titulo = p.entrega === "agencia" ? "Prepáralo y llévalo a la agencia" : p.entrega === "motorizado" ? "Prepáralo y envíalo con tu motorizado" : "Prepáralo para que lo recojan";
    texto =
      p.entrega === "agencia" ? <>Cuando lo dejes en {p.agencia || "la agencia"}, toca “Ya lo envié” y registra el código o la foto de la boleta.</> :
      p.entrega === "motorizado" ? <>Cuando salga, toca “Ya salió” y elige quién lo lleva. {nombre} verá su nombre y celular.</> :
      <>Cuando esté listo, avísale a {nombre} para que pase por tu tienda.</>;
    botones = (
      <>
        {p.entrega !== "recojo" && (
          <Link href={`/vendedor/pedidos/${p.id}/etiqueta`}><Boton variante="secundario"><Printer className="size-4" /> Etiqueta</Boton></Link>
        )}
        <Link href={enviar}><Boton>{p.entrega === "agencia" ? "Ya lo envié" : p.entrega === "motorizado" ? "Ya salió" : "Ya está listo"}</Boton></Link>
      </>
    );
  } else if (p.estado === "listo_recojo") {
    icono = <Store className="size-5" />;
    titulo = `${nombre} vendrá a recoger`;
    texto = <>Cuando llegue, pídele su código de 4 dígitos y toca “Entregar al cliente”.</>;
    botones = <Boton onClick={alEntregar}>Entregar al cliente</Boton>;
  } else if (p.estado === "enviado") {
    icono = <Check className="size-5" />;
    titulo = "No tienes que hacer nada más";
    texto = p.entrega === "motorizado" && p.pago_estado === "pendiente"
      ? <>{nombre} paga desde su app cuando lo reciba. Te avisamos al instante.</>
      : <>{nombre} confirmará cuando lo reciba; si no, se confirma solo en 7 días y se libera tu dinero.</>;
    tono = "bg-pino-claro ring-pino/20";
  } else {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-4 rounded-[22px] p-5 ring-1", tono)}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-pino text-white">{icono}</span>
      <div className="min-w-[220px] flex-1">
        <p className="font-bold text-tinta">{titulo}</p>
        <p className="text-sm text-tinta/80">{texto}</p>
      </div>
      {botones && <div className="flex flex-wrap gap-2">{botones}</div>}
    </div>
  );
}

export function Nota({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-2xl bg-pino-claro px-4 py-3 text-sm text-tinta">
      <Info className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
