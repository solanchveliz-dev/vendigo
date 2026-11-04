"use client";

import { useState } from "react";
import { Check, Crown } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import type { Plan, UsoPlan } from "@/lib/tipos";
import { Aviso, Boton, Cargando, Encabezado, Modal, Tarjeta, cn, useAvisar } from "@/components/ui";

type Pago = { id: string; concepto: string; monto_centimos: number; fecha: string };

export default function PlanYVentas() {
  const uso = useApi<UsoPlan>("/vendedor/plan");
  const planes = useApi<{ planes: Plan[] }>("/planes");
  const pagos = useApi<{ pagos: Pago[] }>("/vendedor/plan/pagos");
  const avisar = useAvisar();
  const [elegido, setElegido] = useState<Plan | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const u = uso.datos;
  if (!u || !planes.datos) return <Cargando />;

  async function cambiar() {
    if (!elegido) return;
    setOcupado(true);
    try {
      uso.setDatos(await api.post<UsoPlan>("/vendedor/plan", { plan_id: elegido.id }));
      avisar(`Ahora estás en el plan ${elegido.nombre}.`);
      setElegido(null);
      pagos.recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado(false);
    }
  }

  async function extra() {
    try {
      uso.setDatos(await api.post<UsoPlan>("/vendedor/plan/ventas-extra"));
      avisar("Listo: tienes 20 ventas más este mes.");
      pagos.recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }

  const pct = u.ventas_limite ? Math.min(100, (u.ventas_usadas / u.ventas_limite) * 100) : 0;
  const gratis = elegido && elegido.precio_centimos > 0 && u.puede_mes_gratis;

  return (
    <div className="space-y-6">
      <Encabezado titulo="Plan y ventas" detalle="VendiGo no cobra comisión por venta. Cada plan trae un cupo de ventas al mes y créditos para la IA." />
      <Tarjeta>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-gris">Tu plan</p>
            <p className="font-display text-2xl font-extrabold text-pino">
              {u.plan.nombre} {u.mes_gratis && <span className="align-middle text-sm font-semibold text-coral">· primer mes gratis</span>}
            </p>
            {u.proximo_cobro && <p className="text-sm text-gris">Próxima renovación: {fecha(u.proximo_cobro)}</p>}
          </div>
          <div className="min-w-56 flex-1 sm:max-w-sm">
            <div className="flex justify-between text-sm">
              <span className="font-semibold">Ventas de este mes</span>
              <span>{u.ventas_limite === null ? `${u.ventas_usadas} · ilimitadas` : `${u.ventas_usadas} de ${u.ventas_limite}`}</span>
            </div>
            {u.ventas_limite !== null && (
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-arena">
                <div className={cn("h-full rounded-full", pct >= 90 ? "bg-coral" : "bg-pino")} style={{ width: `${pct}%` }} />
              </div>
            )}
            {u.ventas_extra > 0 && <p className="mt-1 text-xs text-gris">Incluye {u.ventas_extra} ventas extra.</p>}
          </div>
        </div>
        {u.ventas_quedan !== null && u.ventas_quedan <= 3 && (
          <Aviso tono="aviso" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span>{u.ventas_quedan === 0 ? "Usaste todas tus ventas del mes. No podrás aceptar pedidos nuevos." : `Te quedan ${u.ventas_quedan} ventas este mes.`}</span>
            <Boton tamano="sm" onClick={extra}>
              +20 ventas por S/ 5
            </Boton>
          </Aviso>
        )}
        <p className="mt-4 text-sm text-gris">Cuenta como venta cada pedido que aceptas. Los pedidos que rechazas no gastan tu cupo.</p>
      </Tarjeta>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {planes.datos.planes.map((p) => {
          const actual = p.id === u.plan.id;
          return (
            <div key={p.id} className={cn("flex flex-col rounded-2xl bg-white p-5 shadow-suave ring-1", actual ? "ring-2 ring-coral" : "ring-linea/60", p.id === "crece" && !actual && "ring-pino/40")}>
              <div className="flex items-center justify-between">
                <p className="font-display text-lg font-extrabold text-pino">{p.nombre}</p>
                {p.id === "crece" && <Crown className="size-5 text-coral" />}
              </div>
              <p className="mt-1 font-display text-3xl font-extrabold">
                {p.precio_centimos ? soles(p.precio_centimos).replace(".00", "") : "S/ 0"}
                <span className="text-sm font-normal text-gris"> /mes</span>
              </p>
              <ul className="my-4 flex-1 space-y-2 text-sm">
                <li className="flex gap-2"><Check className="size-4 text-ok" /> {p.ventas_mes === null ? "Ventas ilimitadas" : `${p.ventas_mes} ventas al mes`}</li>
                <li className="flex gap-2"><Check className="size-4 text-ok" /> {p.creditos_ia.toLocaleString("es-PE")} créditos de IA</li>
                <li className="flex gap-2"><Check className="size-4 text-ok" /> Pago protegido y sin comisión</li>
              </ul>
              {actual ? (
                <Boton variante="secundario" disabled bloque>Tu plan</Boton>
              ) : (
                <Boton variante={p.precio_centimos ? "acento" : "secundario"} bloque onClick={() => setElegido(p)}>
                  {p.precio_centimos ? "Elegir plan" : "Volver a Gratis"}
                </Boton>
              )}
            </div>
          );
        })}
      </div>
      {u.puede_mes_gratis && <p className="text-sm text-gris">El primer mes de tu primer plan de pago es gratis.</p>}

      {!!pagos.datos?.pagos.length && (
        <Tarjeta>
          <h2 className="mb-2 font-extrabold text-pino">Pagos de tu plan</h2>
          <div className="divide-y divide-linea">
            {pagos.datos.pagos.map((p) => (
              <div key={p.id} className="flex justify-between py-2.5 text-sm">
                <span>
                  <span className="block font-semibold">{p.concepto}</span>
                  <span className="text-gris">{fecha(p.fecha, true)}</span>
                </span>
                <span className="font-semibold">{p.monto_centimos ? soles(p.monto_centimos) : "Gratis"}</span>
              </div>
            ))}
          </div>
        </Tarjeta>
      )}

      <Modal abierto={!!elegido} onCerrar={() => setElegido(null)} titulo={`Cambiar al plan ${elegido?.nombre ?? ""}`}>
        {elegido && (
          <div className="space-y-4">
            <Aviso tono={gratis ? "ok" : "info"}>
              {elegido.precio_centimos === 0
                ? "Vuelves al plan Gratis: 15 ventas al mes."
                : gratis
                  ? `Tu primer mes es gratis. Luego pagas ${soles(elegido.precio_centimos)} al mes. Puedes cambiar cuando quieras.`
                  : `Pagas ${soles(elegido.precio_centimos)} al mes con tu tarjeta.`}
            </Aviso>
            <Boton bloque variante="acento" cargando={ocupado} onClick={cambiar}>
              Confirmar
            </Boton>
          </div>
        )}
      </Modal>
    </div>
  );
}
