"use client";

import Link from "next/link";
import { useState } from "react";
import { HandCoins, PiggyBank, Rocket, Undo2 } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { fechaHora } from "@/lib/admin";
import { Area, Boton, Campo, Cargando, Entrada, Modal, useAvisar } from "@/components/ui";
import { Estado, Indicador, Tarjeta, Titulo } from "@/components/admin/ui";

type Pendiente = {
  pedido_id: string; codigo: string; tienda: string; tienda_id: string; comprador: string; celular: string;
  origen: "cancelacion" | "reclamo"; monto_centimos: number; cubre_centimos: number; desde: string; dias_habiles: number; vencida: boolean;
};
type Pagada = { id: string; pedido_id: string; codigo: string; tienda: string; monto_centimos: number; estado: "pagada" | "recuperada"; referencia: string; pagada_en: string; recuperada_ref: string; recuperada_en: string | null };
type Datos = {
  reglas: { tope_centimos: number; dias_habiles: number };
  pendientes: Pendiente[];
  garantias: Pagada[];
  resumen: { pagado_centimos: number; por_recuperar_centimos: number; ingresos_destacados_centimos: number; fondo_centimos: number; impulsos_activos: number };
};

// Fondo de emergencia: se alimenta con lo cobrado por impulsos y cubre pedidos que no llegaron
// cuando la tienda no le devuelve al comprador a tiempo.
export default function AdminFondo() {
  const { datos, recargar } = useApi<Datos>("/admin/garantias");
  const avisar = useAvisar();
  const [pagar, setPagar] = useState<Pendiente | null>(null);
  const [recuperar, setRecuperar] = useState<Pagada | null>(null);
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
      setRecuperar(null);
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
        detalle={`Se arma con lo que pagan las tiendas por impulsar productos. Si un pedido no llega y la tienda no le devuelve al comprador en ${g.dias_habiles} días hábiles, VendiGo le devuelve hasta ${soles(g.tope_centimos)} y la tienda queda pausada hasta reponerlo.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador oscuro titulo="Fondo disponible" valor={soles(k.fondo_centimos)} detalle="Ingresos por impulsos menos lo que falta reponer" icono={<PiggyBank className="size-4" />} />
        <Indicador titulo="Impulsos activos" valor={k.impulsos_activos} detalle="Productos impulsados hoy" icono={<Rocket className="size-4" />} />
        <Indicador titulo="Por recuperar" valor={soles(k.por_recuperar_centimos)} detalle="Lo que las tiendas deben reponer" icono={<HandCoins className="size-4" />} alerta={k.por_recuperar_centimos > 0} />
        <Indicador titulo="Ingresos por impulsos" valor={soles(k.ingresos_destacados_centimos)} detalle={`${soles(k.pagado_centimos)} devueltos a compradores`} icono={<Undo2 className="size-4" />} />
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
                  {x.recuperada_en && ` · Repuesto ${fechaHora(x.recuperada_en)} · Op. ${x.recuperada_ref}`}
                </span>
              </span>
              <b className="text-tinta">{soles(x.monto_centimos)}</b>
              {x.estado === "recuperada" ? <Estado tono="ok">Repuesto</Estado> : (
                <Boton tamano="sm" variante="secundario" onClick={() => { setRef(""); setRecuperar(x); }}>La tienda repuso</Boton>
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
              {pagar.monto_centimos > pagar.cubre_centimos && ` El pedido era de ${soles(pagar.monto_centimos)}: la tienda sigue debiendo la diferencia.`} La tienda quedará pausada hasta reponerlo.
            </p>
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

      <Modal abierto={!!recuperar} onCerrar={() => setRecuperar(null)} titulo="La tienda repuso el monto">
        {recuperar && (
          <div className="space-y-4">
            <p className="text-sm text-gris">{recuperar.tienda} repuso {soles(recuperar.monto_centimos)} a VendiGo. Si no debe nada más, su tienda se reactiva.</p>
            <Campo etiqueta="N.° de operación">
              <Entrada value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40} />
            </Campo>
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setRecuperar(null)}>Cancelar</Boton>
              <Boton cargando={enviando} disabled={ref.trim().length < 4} onClick={() => enviar(`/admin/garantias/${recuperar.id}/recuperar`, { referencia: ref.trim() })}>Confirmar</Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
