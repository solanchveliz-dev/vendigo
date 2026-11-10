"use client";

import Link from "next/link";
import { useState } from "react";
import { Percent, PiggyBank, Store, Undo2 } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { fechaHora } from "@/lib/admin";
import { Area, Boton, Campo, Cargando, Entrada, Modal, useAvisar } from "@/components/ui";
import { Estado, Indicador, Tarjeta, Titulo } from "@/components/admin/ui";

type Pendiente = {
  pedido_id: string; codigo: string; tienda: string; tienda_id: string; comprador: string; celular: string;
  origen: "cancelacion" | "reclamo"; monto_centimos: number; cubre_centimos: number; desde: string; dias_habiles: number; vencida: boolean; casos_tienda: number;
};
type Pagada = {
  id: string; pedido_id: string; codigo: string; tienda: string; tienda_id: string; tienda_suspendida: boolean; casos_tienda: number; monto_centimos: number;
  estado: "pagada" | "recuperada"; referencia: string; pagada_en: string; recuperada_ref: string; recuperada_en: string | null;
};
type Datos = {
  reglas: { tope_centimos: number; dias_habiles: number; porcentaje: number; aporte_inicial_centimos: number };
  pendientes: Pendiente[];
  garantias: Pagada[];
  resumen: { pagado_centimos: number; ingresos_vendigo_centimos: number; aporte_centimos: number; fondo_centimos: number; tiendas_suspendidas: number; impulsos_activos: number };
};

// Fondo de emergencia: un solo fondo común que se alimenta con un porcentaje de todo lo que cobra VendiGo
// (más un aporte inicial) y cubre, hasta un tope, los pedidos que no llegaron cuando la tienda no devuelve a tiempo.
// Es limitado y sujeto a revisión. Usarlo no suspende la tienda ni le crea deuda: eso es otra decisión del admin.
export default function AdminFondo() {
  const { datos, recargar } = useApi<Datos>("/admin/garantias");
  const avisar = useAvisar();
  const [pagar, setPagar] = useState<Pendiente | null>(null);
  const [reactivar, setReactivar] = useState<Pagada | null>(null);
  const [ref, setRef] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!datos) return <Cargando />;
  const { reglas: g, resumen: k } = datos;

  async function enviar(ruta: string, cuerpo: object) {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(ruta, cuerpo);
      avisar(r.mensaje);
      setPagar(null);
      setReactivar(null);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      <Titulo
        titulo="Fondo de emergencia"
        detalle={`El ${g.porcentaje} % de todo lo que cobra VendiGo (planes, ventas extra, impulsos y créditos de IA) va a este fondo común. Si un pedido no llega y la tienda no le devuelve al comprador en ${g.dias_habiles} días hábiles, VendiGo le devuelve hasta ${soles(g.tope_centimos)} después de que revises el caso. Usar el fondo no suspende la tienda ni le crea una deuda: si corresponde suspenderla, hazlo desde Tiendas.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador oscuro titulo="Fondo disponible" valor={soles(k.fondo_centimos)} detalle={k.fondo_centimos < 0 ? "En negativo: VendiGo responde con su propio dinero" : "Aportes menos lo devuelto a compradores"} icono={<PiggyBank className="size-4" />} alerta={k.fondo_centimos < 0} />
        <Indicador titulo={`Aporte al fondo (${g.porcentaje} %)`} valor={soles(k.aporte_centimos + g.aporte_inicial_centimos)} detalle={`${g.porcentaje} % de ${soles(k.ingresos_vendigo_centimos)} cobrados${g.aporte_inicial_centimos ? ` + ${soles(g.aporte_inicial_centimos)} de aporte inicial` : ""}`} icono={<Percent className="size-4" />} />
        <Indicador titulo="Devuelto a compradores" valor={soles(k.pagado_centimos)} detalle={`Hasta ${soles(g.tope_centimos)} por pedido`} icono={<Undo2 className="size-4" />} />
        <Indicador titulo="Tiendas suspendidas" valor={k.tiendas_suspendidas} detalle="Por no devolver a tiempo" icono={<Store className="size-4" />} alerta={k.tiendas_suspendidas > 0} />
      </div>

      <Tarjeta titulo={`Pedidos que no llegaron, con devolución pendiente (${datos.pendientes.length})`}>
        {!datos.pendientes.length ? (
          <p className="text-sm text-gris">No hay pedidos que no llegaron con devolución pendiente.</p>
        ) : (
          datos.pendientes.map((x) => (
            <div key={x.pedido_id} className="flex flex-wrap items-center gap-3 border-b border-linea py-3 text-sm last:border-0">
              <span className="min-w-0 flex-1">
                <Link href={`/admin/pedidos/${x.pedido_id}`} className="font-bold text-tinta hover:text-pino">{x.codigo}</Link>
                <span className="text-gris"> · {x.tienda} → {x.comprador} ({x.celular})</span>
                <span className="block text-xs text-gris">
                  {x.origen === "cancelacion" ? "La tienda canceló después de cobrar" : "Reclamo “no me llegó” a favor del cliente"} · {x.dias_habiles} de {g.dias_habiles} días hábiles
                  {x.casos_tienda > 0 && <b className="text-error"> · El fondo ya cubrió a esta tienda {x.casos_tienda === 1 ? "1 vez" : `${x.casos_tienda} veces`} (tenlo en cuenta al revisar)</b>}
                </span>
              </span>
              <b className="text-tinta">{soles(x.monto_centimos)}</b>
              {x.vencida ? <Estado tono="error">Plazo vencido</Estado> : <Estado tono="aviso">En plazo de la tienda</Estado>}
              <Boton tamano="sm" disabled={!x.vencida} onClick={() => { setRef(""); setNota(""); setPagar(x); }}>Devolver {soles(x.cubre_centimos)}</Boton>
            </div>
          ))
        )}
      </Tarjeta>

      <Tarjeta titulo="Devoluciones hechas por VendiGo">
        {!datos.garantias.length ? (
          <p className="text-sm text-gris">VendiGo todavía no tuvo que devolver dinero.</p>
        ) : (
          datos.garantias.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center gap-3 border-b border-linea py-3 text-sm last:border-0">
              <span className="min-w-0 flex-1">
                <b className="text-tinta">{x.codigo}</b> <span className="text-gris">· {x.tienda}</span>
                <span className="block text-xs text-gris">
                  Pagado {fechaHora(x.pagada_en)} · Op. {x.referencia}
                  {x.recuperada_en && ` · La tienda repuso el ${fechaHora(x.recuperada_en)} (sistema anterior)`}
                </span>
              </span>
              <b className="text-tinta">{soles(x.monto_centimos)}</b>
              {x.tienda_suspendida ? (
                <>
                  <Estado tono="error">Tienda suspendida</Estado>
                  <Boton tamano="sm" variante="secundario" onClick={() => { setNota(""); setReactivar(x); }}>Reactivar tienda</Boton>
                </>
              ) : (
                <Estado tono="neutro">Tienda activa</Estado>
              )}
            </div>
          ))
        )}
      </Tarjeta>

      <Modal abierto={!!pagar} onCerrar={() => setPagar(null)} titulo="Devolver al comprador">
        {pagar && (
          <div className="space-y-4">
            <p className="text-sm text-gris">
              Yapea o transfiere <b className="text-tinta">{soles(pagar.cubre_centimos)}</b> desde la cuenta de VendiGo a {pagar.comprador} ({pagar.celular}) y registra el número de operación.
              {pagar.monto_centimos > pagar.cubre_centimos && ` El pedido era de ${soles(pagar.monto_centimos)}: la tienda sigue debiendo la diferencia al comprador.`} La tienda quedará suspendida, sin recibir pedidos, hasta que el equipo revise el caso.
            </p>
            {k.fondo_centimos < pagar.cubre_centimos && (
              <p className="rounded-xl bg-aviso-claro px-3 py-2 text-sm text-tinta">El fondo tiene {soles(k.fondo_centimos)}: no alcanza. VendiGo igual responde al comprador con su propio dinero.</p>
            )}
            <Campo etiqueta="N.° de operación">
              <Entrada value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} />
            </Campo>
            <Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota interna (opcional)" maxLength={300} />
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setPagar(null)}>Cancelar</Boton>
              <Boton cargando={enviando} disabled={ref.trim().length < 4} onClick={() => enviar(`/admin/garantias/${pagar.pedido_id}/pagar`, { referencia: ref.trim(), nota: nota.trim() })}>Registrar devolución</Boton>
            </div>
          </div>
        )}
      </Modal>

      <Modal abierto={!!reactivar} onCerrar={() => setReactivar(null)} titulo="Reactivar tienda">
        {reactivar && (
          <div className="space-y-4">
            <p className="text-sm text-gris">
              {reactivar.tienda} quedó suspendida porque VendiGo cubrió el pedido {reactivar.codigo}. Reactívala solo si revisaste el caso y fue un descuido, no una estafa.
              La tienda verá el motivo.
            </p>
            <Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="¿Por qué se reactiva? (lo verá la tienda)" maxLength={300} />
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setReactivar(null)}>Cancelar</Boton>
              <Boton cargando={enviando} disabled={nota.trim().length < 5} onClick={() => enviar(`/admin/garantias/${reactivar.id}/reactivar`, { motivo: nota.trim() })}>Reactivar tienda</Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
