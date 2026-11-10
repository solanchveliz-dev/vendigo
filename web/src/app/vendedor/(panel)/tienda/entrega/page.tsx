"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bike, Check, ChevronRight, Info, MapPin, Smartphone, Package, Plus, Printer, Store } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { agencias } from "@/lib/catalogos";
import { aCentimos } from "@/lib/formato";
import type { Entrega, Tienda } from "@/lib/tipos";
import { Aviso, Boton, Campo, Cargando, Entrada, Interruptor, Modal, Selector, cn, useAvisar } from "@/components/ui";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// "¿Cómo entregas y cómo te pagan?" igual que en el prototipo.
export default function EntregaYPagos() {
  const { datos: t, setDatos } = useApi<Tienda>("/vendedor/tienda");
  const avisar = useAvisar();
  const [e, setE] = useState<Entrega | null>(null);
  const [costos, setCostos] = useState({ agencia: "", moto: "" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cartel, setCartel] = useState(false);

  useEffect(() => {
    if (t && !e) {
      setE(completar(t.entrega));
      setCostos({
        agencia: t.entrega.costo_agencia_centimos ? (t.entrega.costo_agencia_centimos / 100).toFixed(2) : "",
        moto: t.entrega.costo_motorizado_centimos ? (t.entrega.costo_motorizado_centimos / 100).toFixed(2) : "",
      });
    }
  }, [t, e]);
  if (!t || !e) return <Cargando />;

  const cambiar = (x: Partial<Entrega>) => setE({ ...e, ...x });

  async function guardar() {
    setError("");
    if (!e!.recojo && !e!.agencia && !e!.motorizado && !e!.otra) {
      setError("Elige al menos una forma de entrega.");
      return;
    }
    setGuardando(true);
    try {
      const nueva = await api.put<Tienda>("/vendedor/tienda/entrega", {
        ...e,
        costo_agencia_centimos: aCentimos(costos.agencia || "0"),
        costo_motorizado_centimos: aCentimos(costos.moto || "0"),
      });
      setDatos(nueva);
      setE(completar(nueva.entrega));
      avisar("Entrega y pagos guardados");
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/tienda" className="hover:text-tinta">Tienda</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-tinta">Entrega y pagos</span>
      </nav>
      <div className="mb-6">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[28px] font-extrabold leading-tight text-pino">¿Cómo entregas y cómo te pagan?</h1>
        <p className="mt-1 text-sm text-gris">Marca lo que ofreces. Solo te pedimos lo necesario.</p>
      </div>

      {error && <Aviso tono="error" className="mb-4">{error}</Aviso>}

      <div className="space-y-4">
        <Opcion
          activo={e.recojo}
          onCambiar={(v) => cambiar({ recojo: v })}
          icono={<Store className="size-5" />}
          titulo="Recojo en tienda"
          texto="El cliente elige qué día irá y paga en la app. Si no llega ese día, la reserva se cancela sola."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo etiqueta="Dirección">
                <Entrada value={e.direccion_recojo} onChange={(x) => cambiar({ direccion_recojo: x.target.value })} placeholder="Calle, número y distrito" />
              </Campo>
            </div>
            <Campo etiqueta="Horario" ayuda="Es tu horario de atención, se cambia en Tu tienda.">
              <Link href="/vendedor/tienda" className="block rounded-xl bg-crema px-4 py-2.5 text-sm ring-1 ring-linea hover:ring-pino/40">
                {t.horario || "Aún no pones tu horario"} <span className="font-semibold text-coral">· cambiar</span>
              </Link>
            </Campo>
            <Campo etiqueta="Instrucciones (opcional)">
              <Entrada value={e.instrucciones_recojo} onChange={(x) => cambiar({ instrucciones_recojo: x.target.value })} placeholder="Ej. Toca el timbre del taller 2" maxLength={200} />
            </Campo>
          </div>
          <div className="mt-4">
            <span className="mb-2 block text-sm font-semibold text-tinta">Días que atiendes</span>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((n, i) => {
                const on = e.dias_recojo.includes(i);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => cambiar({ dias_recojo: on ? e.dias_recojo.filter((d) => d !== i) : [...e.dias_recojo, i].sort() })}
                    className={cn("rounded-full px-4 py-2 text-sm font-semibold transition", on ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea")}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 border-t border-linea pt-2">
            <Interruptor
              activo={e.adelanto_pct > 0}
              onChange={(v) => cambiar({ adelanto_pct: v ? 30 : 0 })}
              etiqueta="Pedir adelanto para reservar"
              detalle="Útil en productos caros o por encargo. Si el cliente no llega, el adelanto queda para ti (se lo avisamos antes de pagar). Al recoger, paga el resto desde la app."
            />
            <button type="button" onClick={() => setCartel(true)} className="mb-2 text-sm font-semibold text-pino underline underline-offset-2">
              Ver cartel para tu mostrador
            </button>
            {e.adelanto_pct > 0 && (
              <div className="mb-2 flex items-center gap-3">
                <span className="text-sm">Adelanto:</span>
                <div className="w-48">
                  <Selector value={e.adelanto_pct} onChange={(x) => cambiar({ adelanto_pct: Number(x.target.value) })}>
                    {[20, 30, 50].map((v) => <option key={v} value={v}>{v}% del pedido</option>)}
                  </Selector>
                </div>
              </div>
            )}
          </div>
        </Opcion>

        <Opcion
          activo={e.agencia}
          onCambiar={(v) => cambiar({ agencia: v })}
          icono={<Package className="size-5" />}
          titulo="Envío por agencia"
          texto="El cliente paga por adelantado. Tú dejas el paquete y registras el código o la foto de la boleta de envío (es tu prueba si hay reclamo)."
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div>
              <span className="mb-2 block text-sm font-semibold text-tinta">Agencias con las que trabajas</span>
              <div className="flex flex-wrap gap-2">
                {agencias.map((a) => {
                  const on = e.agencias.includes(a);
                  return (
                    <button key={a} type="button" onClick={() => cambiar({ agencias: on ? e.agencias.filter((x) => x !== a) : [...e.agencias, a] })} className={cn("rounded-full px-4 py-2 text-sm font-semibold transition", on ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea")}>
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
            <Campo etiqueta="Costo referencial">
              <Soles valor={costos.agencia} onCambiar={(v) => setCostos({ ...costos, agencia: v })} />
            </Campo>
          </div>
        </Opcion>

        <Opcion
          activo={e.motorizado}
          onCambiar={(v) => cambiar({ motorizado: v })}
          icono={<Bike className="size-5" />}
          titulo="Delivery con motorizado"
          texto="Coordinas con tu motorizado. El cliente paga al recibir, desde su app: si no llega, no paga."
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <Campo etiqueta="Zonas que cubres">
              <Entrada value={e.zonas_motorizado} onChange={(x) => cambiar({ zonas_motorizado: x.target.value })} placeholder="Miraflores, San Isidro, Surco…" />
            </Campo>
            <Campo etiqueta="Costo desde">
              <Soles valor={costos.moto} onCambiar={(v) => setCostos({ ...costos, moto: v })} />
            </Campo>
          </div>
        </Opcion>

        <Opcion activo={e.otra} onCambiar={(v) => cambiar({ otra: v })} icono={<MapPin className="size-5" />} titulo="Otra modalidad" texto="Por ejemplo, punto de encuentro.">
          <Campo etiqueta="Describe cómo entregas">
            <Entrada value={e.descripcion_otra} onChange={(x) => cambiar({ descripcion_otra: x.target.value })} placeholder="Ej. Punto de encuentro en estación Ricardo Palma, sábados 4 p. m." maxLength={200} />
          </Campo>
        </Opcion>

        <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
          <h3 className="text-lg font-extrabold text-tinta">Cómo te pagan</h3>
          <p className="mt-1 text-sm text-gris">Tus clientes te pagan directo a ti. VendiGo no recibe ni guarda tu dinero.</p>
          <Link href="/vendedor/tienda/pagos" className="mt-3 flex items-center gap-3 rounded-2xl bg-crema/70 px-4 py-3 ring-1 ring-linea hover:ring-pino/40">
            <span className="grid size-10 place-items-center rounded-xl bg-white text-pino"><Smartphone className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <b className="block text-sm text-tinta">
                {t.metodos_pago?.length ? t.metodos_pago.map((m) => ({ yape_directo: "Yape", plin_directo: "Plin", efectivo: "Efectivo" })[m] ?? m).join(" · ") : "Aún no configuras cómo te pagan"}
              </b>
              <span className="text-xs text-gris">{t.metodos_pago?.length ? "Toca para cambiar tus datos de pago" : "Agrega tu Yape, Plin o acepta efectivo para recibir pedidos"}</span>
            </span>
            <ChevronRight className="size-4 text-gris" />
          </Link>
        </section>

        <div className="flex gap-3 rounded-2xl bg-pino-claro px-4 py-3 text-sm text-pino">
          <Info className="mt-0.5 size-5 shrink-0" />
          <span><b>VendiGo no se encarga del envío.</b> Tú preparas y despachas; nosotros registramos la información y se la mostramos a tu cliente.</span>
        </div>

        <Boton tamano="lg" onClick={guardar} cargando={guardando}>Guardar</Boton>
      </div>

      <Modal abierto={cartel} onCerrar={() => setCartel(false)} titulo="Cartel para tu mostrador">
        <div id="cartel" className="rounded-2xl border-2 border-dashed border-pino/30 p-6 text-center">
          <p className="font-display text-2xl font-extrabold text-pino">{t.nombre}</p>
          <p className="mt-3 text-lg font-bold text-tinta">¿Reservaste por VendiGo?</p>
          <p className="mt-1 text-gris">Muéstranos tu código de 4 dígitos. Si aún no pagaste, puedes pagar aquí con Yape, Plin o efectivo.</p>
          {e.adelanto_pct > 0 && <p className="mt-3 text-sm text-gris">Si no recoges el día elegido, el adelanto ({e.adelanto_pct}%) queda para la tienda.</p>}
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ok"><Check className="size-4" /> Pedido con seguimiento VendiGo</p>
        </div>
        <Boton bloque className="mt-4" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Boton>
      </Modal>
    </div>
  );
}

// Si la API todavía no manda los campos nuevos, usamos valores por defecto.
function completar(x: Partial<Entrega>): Entrega {
  return {
    ...x,
    agencias: x.agencias ?? [],
    dias_recojo: x.dias_recojo ?? [1, 2, 3, 4, 5, 6],
    instrucciones_recojo: x.instrucciones_recojo ?? "",
    adelanto_pct: x.adelanto_pct ?? 0,
    costo_agencia_centimos: x.costo_agencia_centimos ?? 0,
    otra: x.otra ?? false,
    descripcion_otra: x.descripcion_otra ?? "",
  } as Entrega;
}

function Opcion({ activo, onCambiar, icono, titulo, texto, children }: {
  activo: boolean; onCambiar: (v: boolean) => void; icono: React.ReactNode; titulo: string; texto: string; children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-[22px] bg-white p-5 shadow-suave ring-1 transition", activo ? "ring-2 ring-pino/50" : "ring-linea/60")}>
      <button type="button" onClick={() => onCambiar(!activo)} className="flex w-full items-start gap-3 text-left">
        <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ring-1", activo ? "bg-pino text-white ring-pino" : "bg-white ring-linea")}>
          {activo && <Check className="size-3.5" />}
        </span>
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", activo ? "bg-pino text-coral" : "bg-arena text-pino")}>{activo ? icono : <Plus className="size-5" />}</span>
        <span className="min-w-0">
          <b className="block text-tinta">{titulo}</b>
          <span className="block text-sm text-gris">{texto}</span>
        </span>
      </button>
      {activo && <div className="mt-4 sm:pl-[76px]">{children}</div>}
    </section>
  );
}

function Soles({ valor, onCambiar }: { valor: string; onCambiar: (v: string) => void }) {
  return (
    <div className="flex items-center rounded-xl bg-white ring-1 ring-linea focus-within:ring-pino">
      <span className="border-r border-linea px-3 text-sm text-gris">S/</span>
      <input inputMode="decimal" value={valor} onChange={(x) => onCambiar(x.target.value.replace(",", "."))} placeholder="0.00" className="w-full bg-transparent px-3 py-2.5 text-sm outline-none" />
    </div>
  );
}
