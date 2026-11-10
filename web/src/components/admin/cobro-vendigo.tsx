"use client";

import { useEffect, useState } from "react";
import { CreditCard, Landmark, Smartphone } from "lucide-react";
import { api, ErrorApi } from "@/lib/api";
import type { PagoVendiGo } from "@/lib/pagos-plan";
import { Boton, Entrada, Interruptor, Selector, cn, useAvisar } from "@/components/ui";
import { Tarjeta } from "@/components/admin/ui";

const BANCOS = ["BCP", "Interbank", "BBVA", "Scotiabank", "BanBif", "Banco de la Nación", "Banco Pichincha", "Caja Arequipa", "Caja Huancayo", "Caja Piura", "Caja Cusco", "Otro"];
const MARCAS = [{ id: "visa", t: "Visa" }, { id: "mastercard", t: "Mastercard" }, { id: "amex", t: "American Express" }, { id: "diners", t: "Diners Club" }];

function Campo({ t, children, ayuda }: { t: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-tinta">{t}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-gris">{ayuda}</span>}
    </label>
  );
}

function Bloque({ icono, titulo, activo, cambiar, children }: { icono: React.ReactNode; titulo: string; activo: boolean; cambiar: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl p-4 ring-1", activo ? "ring-pino/40" : "ring-linea")}>
      <div className="flex items-center gap-3">
        <span className={cn("grid size-9 place-items-center rounded-xl", activo ? "bg-pino text-white" : "bg-crema text-tinta")}>{icono}</span>
        <div className="flex-1"><Interruptor activo={activo} onChange={cambiar} etiqueta={titulo} /></div>
      </div>
      {activo && <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>}
    </div>
  );
}

// Cómo le pagan las tiendas a VendiGo (planes, ventas extra e impulsos).
export function CobroVendiGoForm({ inicial, correo, alGuardar }: { inicial: PagoVendiGo; correo: string; alGuardar: () => void }) {
  const avisar = useAvisar();
  const [c, setC] = useState(inicial);
  const [on, setOn] = useState({ yape: false, plin: false, tarjeta: false, transferencia: false });
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    setC(inicial);
    setOn({ yape: !!inicial.yape, plin: !!inicial.plin, tarjeta: !!inicial.tarjeta_link, transferencia: !!(inicial.cuenta || inicial.cci) });
  }, [inicial]);
  const x = (k: keyof PagoVendiGo) => ({ value: c[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setC({ ...c, [k]: e.target.value }) });

  async function guardar() {
    setGuardando(true);
    try {
      const cobro = {
        ...c,
        yape: on.yape ? c.yape : "",
        plin: on.plin ? c.plin : "",
        titular: on.yape || on.plin ? c.titular : "",
        tarjeta_link: on.tarjeta ? c.tarjeta_link : "",
        tarjeta_marcas: on.tarjeta ? c.tarjeta_marcas : [],
        banco: on.transferencia ? c.banco : "",
        cuenta: on.transferencia ? c.cuenta : "",
        cci: on.transferencia ? c.cci : "",
        banco_titular: on.transferencia ? c.banco_titular : "",
        metodos: [],
      };
      const r = await api.put<{ mensaje: string }>("/admin/configuracion", { correo_soporte: correo, cobro_vendigo: cobro });
      avisar(r.mensaje);
      alGuardar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Tarjeta titulo="Pagos manuales a VendiGo (desactivados)">
      <p className="mb-4 text-sm text-gris">
        Las tiendas le pagan a VendiGo solo con Culqi (tarjeta o Yape) y cada compra se activa sola en cuanto Culqi aprueba el cobro. Estos datos de Yape, Plin, tarjeta y banco
        se guardan, pero ya no se muestran a las tiendas. Las llaves de Culqi van en la configuración del servidor (CULQI_LLAVE_PUBLICA y CULQI_LLAVE_SECRETA), nunca aquí.
      </p>
      <div className="space-y-3">
        <Bloque icono={<Smartphone className="size-4" />} titulo="Yape" activo={on.yape} cambiar={(v) => setOn({ ...on, yape: v })}>
          <Campo t="Número de Yape"><Entrada inputMode="numeric" maxLength={9} {...x("yape")} placeholder="9XXXXXXXX" /></Campo>
        </Bloque>
        <Bloque icono={<Smartphone className="size-4" />} titulo="Plin" activo={on.plin} cambiar={(v) => setOn({ ...on, plin: v })}>
          <Campo t="Número de Plin"><Entrada inputMode="numeric" maxLength={9} {...x("plin")} placeholder="9XXXXXXXX" /></Campo>
        </Bloque>
        {(on.yape || on.plin) && (
          <Campo t="Titular de Yape / Plin" ayuda="El nombre que ve la tienda al pagar."><Entrada maxLength={80} {...x("titular")} /></Campo>
        )}
        <Bloque icono={<CreditCard className="size-4" />} titulo="Tarjeta (link de pago)" activo={on.tarjeta} cambiar={(v) => setOn({ ...on, tarjeta: v })}>
          <Campo t="Link de pago" ayuda="Mercado Pago, Izipay, Niubiz u otro."><Entrada maxLength={300} {...x("tarjeta_link")} placeholder="https://..." /></Campo>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-tinta">Tarjetas que aceptas</span>
            <div className="flex flex-wrap gap-2">
              {MARCAS.map((m) => {
                const sel = c.tarjeta_marcas.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => setC({ ...c, tarjeta_marcas: sel ? c.tarjeta_marcas.filter((z) => z !== m.id) : [...c.tarjeta_marcas, m.id] })}
                    className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", sel ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea")}>
                    {m.t}
                  </button>
                );
              })}
            </div>
          </div>
        </Bloque>
        <Bloque icono={<Landmark className="size-4" />} titulo="Transferencia bancaria" activo={on.transferencia} cambiar={(v) => setOn({ ...on, transferencia: v })}>
          <Campo t="Banco"><Selector {...x("banco")}><option value="">Elige</option>{BANCOS.map((b) => <option key={b}>{b}</option>)}</Selector></Campo>
          <Campo t="Titular de la cuenta"><Entrada maxLength={80} {...x("banco_titular")} /></Campo>
          <Campo t="N.° de cuenta"><Entrada maxLength={24} {...x("cuenta")} /></Campo>
          <Campo t="CCI" ayuda="20 dígitos."><Entrada maxLength={23} {...x("cci")} /></Campo>
        </Bloque>
      </div>
      <Boton className="mt-4" onClick={guardar} cargando={guardando}>Guardar métodos de cobro</Boton>
    </Tarjeta>
  );
}
