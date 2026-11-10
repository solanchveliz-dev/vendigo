"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, CreditCard, ImagePlus, Info, Landmark, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { subirImagen } from "@/lib/subir";
import type { Tienda } from "@/lib/tipos";
import { Aviso, Boton, Campo, Cargando, Entrada, Interruptor, Selector, cn, useAvisar } from "@/components/ui";

const BANCOS = ["BCP", "Interbank", "BBVA", "Scotiabank", "BanBif", "Banco de la Nación", "Banco Pichincha", "Caja Arequipa", "Caja Huancayo", "Caja Piura", "Caja Cusco", "Otro"];
const MARCAS = [
  { id: "visa", t: "Visa" },
  { id: "mastercard", t: "Mastercard" },
  { id: "amex", t: "American Express" },
  { id: "diners", t: "Diners Club" },
];

type Qr = { key: string | null; url: string };
type Datos = {
  yape: boolean; yapeNumero: string; yapeQr: Qr;
  plin: boolean; plinNumero: string; plinQr: Qr;
  titular: string;
  tarjeta: boolean; link: string; marcas: string[];
  transf: boolean; banco: string; cuenta: string; cci: string; transfTitular: string;
};

const celular = (v: string) => /^9\d{8}$/.test(v);

function desdeTienda(t: Tienda): Datos {
  return {
    yape: !!t.yape_numero, yapeNumero: t.yape_numero ?? "", yapeQr: { key: t.pago_qr_key, url: t.pago_qr_url ?? "" },
    plin: !!t.plin_numero, plinNumero: t.plin_numero ?? "", plinQr: { key: t.plin_qr_key, url: t.plin_qr_url ?? "" },
    titular: t.pago_titular ?? "",
    tarjeta: !!t.tarjeta_link, link: t.tarjeta_link ?? "", marcas: t.tarjeta_marcas?.length ? t.tarjeta_marcas : ["visa", "mastercard"],
    transf: !!(t.transf_cuenta || t.transf_cci), banco: t.transf_banco ?? "", cuenta: t.transf_cuenta ?? "", cci: t.transf_cci ?? "", transfTitular: t.transf_titular ?? "",
  };
}

function Metodo({ icono, titulo, detalle, activo, onChange, children }: { icono: React.ReactNode; titulo: string; detalle: string; activo: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-[22px] bg-white p-5 shadow-suave ring-1 transition", activo ? "ring-pino/40" : "ring-linea/60")}>
      <div className="flex items-center gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", activo ? "bg-pino text-white" : "bg-crema text-tinta")}>{icono}</span>
        <div className="min-w-0 flex-1"><Interruptor activo={activo} onChange={onChange} etiqueta={titulo} detalle={detalle} /></div>
      </div>
      {activo && <div className="mt-4 space-y-4 border-t border-linea pt-4">{children}</div>}
    </section>
  );
}

function SubirQR({ qr, onCambio, nombre }: { qr: Qr; onCambio: (q: Qr) => void; nombre: string }) {
  const archivo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const avisar = useAvisar();
  async function subir(f?: File) {
    if (!f) return;
    setSubiendo(true);
    try {
      const r = await subirImagen(f, "pago_qr");
      onCambio({ key: r.key, url: r.url });
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setSubiendo(false);
      if (archivo.current) archivo.current.value = "";
    }
  }
  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-tinta">QR de {nombre} (opcional)</p>
      <div className="flex items-center gap-4">
        {qr.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr.url} alt={`QR de ${nombre}`} className="size-28 rounded-2xl object-contain ring-1 ring-linea" />
        ) : (
          <span className="grid size-28 place-items-center rounded-2xl bg-crema/70 text-gris ring-1 ring-linea"><ImagePlus className="size-6" /></span>
        )}
        <div className="space-y-2">
          <input ref={archivo} type="file" accept="image/*" hidden onChange={(e) => subir(e.target.files?.[0])} />
          <Boton tamano="sm" variante="secundario" cargando={subiendo} onClick={() => archivo.current?.click()}>{qr.url ? "Cambiar QR" : "Subir QR"}</Boton>
          {qr.url && <button onClick={() => onCambio({ key: null, url: "" })} className="flex items-center gap-1 text-xs font-semibold text-error"><Trash2 className="size-3.5" /> Quitar</button>}
          <p className="text-xs text-gris">Captura del QR desde tu app de {nombre}.</p>
        </div>
      </div>
    </div>
  );
}

// La tienda elige sus métodos de pago. El cliente le paga directo; VendiGo no recibe ese dinero.
export default function ComoTePagan() {
  const { datos: t, setDatos } = useApi<Tienda>("/vendedor/tienda");
  const avisar = useAvisar();
  const [d, setD] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (t && !d) setD(desdeTienda(t));
  }, [t, d]);
  if (!t || !d) return <Cargando />;
  const cambiar = (x: Partial<Datos>) => setD({ ...d, ...x });
  const activos = [d.yape, d.plin, d.tarjeta, d.transf].filter(Boolean).length;

  function revisar(x: Datos) {
    if (!activos) return "Activa al menos un método de pago.";
    if (x.yape && !celular(x.yapeNumero)) return "El número de Yape debe tener 9 dígitos y empezar con 9.";
    if (x.plin && !celular(x.plinNumero)) return "El número de Plin debe tener 9 dígitos y empezar con 9.";
    if ((x.yape || x.plin) && x.titular.trim().length < 3) return "Escribe el nombre que aparece en tu Yape o Plin.";
    if (x.tarjeta && !/^https:\/\/\S+\.\S+/.test(x.link.trim())) return "El link de pago con tarjeta debe empezar con https://";
    if (x.tarjeta && !x.marcas.length) return "Marca qué tarjetas aceptas.";
    if (x.transf) {
      if (!x.banco) return "Elige el banco de tu cuenta.";
      if (!x.cuenta && !x.cci) return "Escribe tu número de cuenta o tu CCI.";
      if (x.cuenta && !/^\d{10,20}$/.test(x.cuenta.replace(/-/g, ""))) return "El número de cuenta debe tener entre 10 y 20 dígitos.";
      if (x.cci && !/^\d{20}$/.test(x.cci.replace(/-/g, ""))) return "El CCI debe tener 20 dígitos.";
      if (x.transfTitular.trim().length < 3) return "Escribe el titular de la cuenta.";
    }
    return "";
  }

  async function guardar() {
    const e = revisar(d!);
    setError(e);
    if (e) return;
    setGuardando(true);
    try {
      const x = d!;
      const nueva = await api.put<Tienda>("/vendedor/tienda/pagos", {
        yape_numero: x.yape ? x.yapeNumero : "",
        plin_numero: x.plin ? x.plinNumero : "",
        pago_titular: x.yape || x.plin ? x.titular.trim() : "",
        pago_qr_key: x.yape ? x.yapeQr.key ?? "" : "",
        plin_qr_key: x.plin ? x.plinQr.key ?? "" : "",
        tarjeta_link: x.tarjeta ? x.link.trim() : "",
        tarjeta_marcas: x.tarjeta ? x.marcas : [],
        transf_banco: x.transf ? x.banco : "",
        transf_cuenta: x.transf ? x.cuenta.trim() : "",
        transf_cci: x.transf ? x.cci.replace(/-/g, "").trim() : "",
        transf_titular: x.transf ? x.transfTitular.trim() : "",
      });
      setDatos(nueva);
      setD(desdeTienda(nueva));
      avisar("Métodos de pago guardados");
    } catch (er) {
      setError((er as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/tienda" className="hover:text-tinta">Tienda</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-tinta">Cómo te pagan</span>
      </nav>
      <div className="mb-6">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[28px] font-extrabold leading-tight text-pino">¿Cómo te pagan tus clientes?</h1>
        <p className="mt-1 text-sm text-gris">Activa los métodos que usas. Tus clientes solo verán esos. El dinero llega directo a ti: VendiGo no lo recibe ni cobra comisión. No se acepta efectivo.</p>
      </div>

      {error && <Aviso tono="error" className="mb-4">{error}</Aviso>}

      <div className="space-y-4">
        <Metodo icono={<Smartphone className="size-5" />} titulo="Yape" detalle="Te yapean a tu número o escaneando tu QR." activo={d.yape} onChange={(v) => cambiar({ yape: v })}>
          <Campo etiqueta="Número de Yape">
            <Entrada inputMode="numeric" maxLength={9} value={d.yapeNumero} onChange={(e) => cambiar({ yapeNumero: e.target.value.replace(/\D/g, "") })} placeholder="9XXXXXXXX" />
          </Campo>
          <SubirQR nombre="Yape" qr={d.yapeQr} onCambio={(q) => cambiar({ yapeQr: q })} />
        </Metodo>

        <Metodo icono={<Smartphone className="size-5" />} titulo="Plin" detalle="Te plinean a tu número o escaneando tu QR." activo={d.plin} onChange={(v) => cambiar({ plin: v })}>
          <Campo etiqueta="Número de Plin">
            <Entrada inputMode="numeric" maxLength={9} value={d.plinNumero} onChange={(e) => cambiar({ plinNumero: e.target.value.replace(/\D/g, "") })} placeholder="9XXXXXXXX" />
          </Campo>
          <SubirQR nombre="Plin" qr={d.plinQr} onCambio={(q) => cambiar({ plinQr: q })} />
        </Metodo>

        {(d.yape || d.plin) && (
          <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
            <Campo etiqueta="Nombre del titular de Yape / Plin" ayuda="Tal como aparece en tu app. Así tu cliente confirma que te paga a ti.">
              <Entrada value={d.titular} onChange={(e) => cambiar({ titular: e.target.value })} maxLength={80} placeholder="Ej. María P. Quispe" />
            </Campo>
          </section>
        )}

        <Metodo icono={<CreditCard className="size-5" />} titulo="Tarjeta" detalle="Con tu propio link de pago (Mercado Pago, Izipay, Niubiz u otro)." activo={d.tarjeta} onChange={(v) => cambiar({ tarjeta: v })}>
          <Campo etiqueta="Link de pago con tarjeta" ayuda="El cobro llega directo a tu cuenta de ese servicio.">
            <Entrada value={d.link} onChange={(e) => cambiar({ link: e.target.value })} maxLength={300} placeholder="https://link.mercadopago.com.pe/tutienda" inputMode="url" />
          </Campo>
          <div>
            <p className="mb-2 text-sm font-semibold text-tinta">¿Qué tarjetas aceptas?</p>
            <div className="flex flex-wrap gap-2">
              {MARCAS.map((m) => {
                const on = d.marcas.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => cambiar({ marcas: on ? d.marcas.filter((x) => x !== m.id) : [...d.marcas, m.id] })}
                    className={cn("rounded-full px-4 py-2 text-sm font-semibold transition", on ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea")}
                  >
                    {m.t}
                  </button>
                );
              })}
            </div>
          </div>
        </Metodo>

        <Metodo icono={<Landmark className="size-5" />} titulo="Transferencia bancaria" detalle="Te transfieren a tu cuenta de banco o caja." activo={d.transf} onChange={(v) => cambiar({ transf: v })}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo etiqueta="Banco o caja">
              <Selector value={d.banco} onChange={(e) => cambiar({ banco: e.target.value })}>
                <option value="">Elige</option>
                {BANCOS.map((b) => <option key={b} value={b}>{b}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Titular de la cuenta">
              <Entrada value={d.transfTitular} onChange={(e) => cambiar({ transfTitular: e.target.value })} maxLength={80} />
            </Campo>
            <Campo etiqueta="Número de cuenta">
              <Entrada inputMode="numeric" maxLength={24} value={d.cuenta} onChange={(e) => cambiar({ cuenta: e.target.value.replace(/[^\d-]/g, "") })} placeholder="Ej. 191-12345678-0-12" />
            </Campo>
            <Campo etiqueta="CCI (interbancario)" ayuda="20 dígitos. Sirve para transferir desde otro banco.">
              <Entrada inputMode="numeric" maxLength={23} value={d.cci} onChange={(e) => cambiar({ cci: e.target.value.replace(/[^\d-]/g, "") })} />
            </Campo>
          </div>
        </Metodo>

        <MercadoPago />

        <div className="flex gap-3 rounded-2xl bg-pino-claro px-4 py-3 text-sm text-pino">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <span>Tus números, QR, link y cuenta solo los ve el cliente después de hacer su pedido, en su página de seguimiento. No aparecen en tu tienda pública.</span>
        </div>
        <div className="flex gap-3 rounded-2xl bg-crema/70 px-4 py-3 text-sm text-tinta">
          <Info className="mt-0.5 size-5 shrink-0 text-pino" />
          <span>
            Cuando te llegue un pago, entra al pedido y toca <b>Revisar el pago</b>. Cuándo te pagan (completo, adelanto o al recibir) lo eliges en{" "}
            <Link href="/vendedor/tienda/entrega" className="font-semibold underline">Entrega</Link>.
          </span>
        </div>

        <Boton tamano="lg" onClick={guardar} cargando={guardando}>Guardar</Boton>
      </div>
    </div>
  );
}

type EstadoMP = { disponible: boolean; vinculada: boolean; vinculada_en?: string; url_autorizacion?: string };

// Mercado Pago es OPCIONAL: la tienda vincula su propia cuenta y sus clientes pueden pagar con tarjeta o
// PagoEfectivo; el pago se confirma solo. El dinero va directo a la tienda: VendiGo no cobra comisión.
function MercadoPago() {
  const avisar = useAvisar();
  const { datos, recargar } = useApi<EstadoMP>("/vendedor/mercadopago");
  const [ocupado, setOcupado] = useState(false);
  if (!datos || !datos.disponible) return null;
  async function desvincular() {
    setOcupado(true);
    try {
      const r = await api.del<{ mensaje: string }>("/vendedor/mercadopago");
      avisar(r.mensaje);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><CreditCard className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <b className="block text-tinta">Mercado Pago <span className="font-normal text-gris">(opcional)</span></b>
          <span className="text-sm text-gris">
            {datos.vinculada
              ? "Vinculada. Tus clientes pueden pagar con tarjeta o PagoEfectivo y el pago se confirma solo."
              : "Vincula tu cuenta para cobrar con tarjeta o PagoEfectivo sin revisar capturas. Mercado Pago te cobra su comisión por venta; VendiGo no cobra nada."}
          </span>
        </div>
        {datos.vinculada ? (
          <Boton variante="secundario" tamano="sm" cargando={ocupado} onClick={desvincular}>Desvincular</Boton>
        ) : (
          datos.url_autorizacion && <a href={datos.url_autorizacion}><Boton tamano="sm">Vincular Mercado Pago</Boton></a>
        )}
      </div>
    </div>
  );
}
