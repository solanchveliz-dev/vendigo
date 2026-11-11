"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Boton, Cargando, Entrada, useAvisar } from "@/components/ui";
import { Tarjeta, Titulo } from "@/components/admin/ui";
import { CobroVendiGoForm } from "@/components/admin/cobro-vendigo";
import type { PagoVendiGo } from "@/lib/pagos-plan";

type Config = { correo_soporte: string; planes_yape: string; planes_titular: string; inactividad_min: number; agencias: string[]; sedes_activas: number; extras: Record<string, number>; cobro_vendigo: PagoVendiGo };

const EXTRAS: { k: string; t: string; ayuda: string; dias?: boolean }[] = [
  { k: "garantia_tope_centimos", t: "Tope del fondo de emergencia (S/)", ayuda: "Máximo que devuelve VendiGo por pedido que no llegó." },
  { k: "garantia_dias_habiles", t: "Plazo de la tienda (días hábiles)", ayuda: "Para devolver antes de que pague VendiGo.", dias: true },
  { k: "destacado_precio_centimos", t: "Impulsar 7 días (S/)", ayuda: "Los paquetes de 3 y 15 días se calculan en proporción." },
  { k: "fondo_porcentaje", t: "Aporte al fondo (% de los ingresos)", ayuda: "Parte de todo lo que cobra VendiGo que va al fondo de emergencia (0 a 50).", dias: true },
  { k: "fondo_aporte_inicial_centimos", t: "Aporte inicial al fondo (S/)", ayuda: "Lo que VendiGo pone de su capital para que el fondo no empiece en cero." },
];
const aTexto = (e: { dias?: boolean }, v: number) => (e.dias ? String(v) : (v / 100).toFixed(2));
type Plan = { id: string; nombre: string; creditos_ia: number };

function Fila({ titulo, detalle, children }: { titulo: string; detalle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea py-4 last:border-0">
      <div>
        <b className="block text-[15px] text-tinta">{titulo}</b>
        {detalle && <span className="text-sm text-gris">{detalle}</span>}
      </div>
      {children}
    </div>
  );
}
const enlace = "inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-bold text-tinta ring-1 ring-linea hover:ring-pino/40";

export default function Configuracion() {
  const avisar = useAvisar();
  const { datos: c, recargar } = useApi<Config>("/admin/configuracion");
  const planes = useApi<{ planes: Plan[] }>("/admin/planes");
  const [correo, setCorreo] = useState("");
  const prov = useApi<{ razon_social: string; ruc: string; direccion_fiscal: string }>("/legal/proveedor");
  const [pv, setPv] = useState({ razon_social: "", ruc: "", direccion_fiscal: "" });
  const [guardandoPv, setGuardandoPv] = useState(false);
  useEffect(() => { if (prov.datos) setPv({ razon_social: prov.datos.razon_social, ruc: prov.datos.ruc, direccion_fiscal: prov.datos.direccion_fiscal }); }, [prov.datos]);
  async function guardarPv() {
    setGuardandoPv(true);
    try {
      const r = await api.put<{ mensaje: string }>("/admin/legal/proveedor", pv);
      avisar(r.mensaje);
      prov.recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setGuardandoPv(false);
    }
  }
  const [guardando, setGuardando] = useState(false);
  const [ex, setEx] = useState<Record<string, string>>({});
  useEffect(() => {
    if (c) {
      setCorreo(c.correo_soporte);
      setEx(Object.fromEntries(EXTRAS.map((e) => [e.k, aTexto(e, c.extras?.[e.k] ?? 0)])));
    }
  }, [c]);
  const cambioExtras = !!c && EXTRAS.some((e) => ex[e.k] !== aTexto(e, c.extras?.[e.k] ?? 0));

  async function guardar() {
    setGuardando(true);
    try {
      const r = await api.put<{ mensaje: string }>("/admin/configuracion", {
        correo_soporte: correo,
        extras: Object.fromEntries(EXTRAS.map((e) => [e.k, e.dias ? parseInt(ex[e.k] || "0", 10) : Math.round(parseFloat(ex[e.k] || "0") * 100)])),
      });
      avisar(r.mensaje);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <Titulo titulo="Configuración de la plataforma" />
      {!c ? (
        <Cargando />
      ) : (
        <>
          <Tarjeta titulo="General">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-tinta">Correo de soporte</span>
                <Entrada type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
                <span className="mt-1 block text-xs text-gris">Aparece en los avisos que el equipo envía a las tiendas.</span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-tinta">Moneda</span>
                <Entrada value="Soles (PEN)" disabled />
                <span className="mt-1 block text-xs text-gris">Todos los precios se muestran en soles.</span>
              </label>
            </div>
            <p className="mt-6 text-sm font-bold text-tinta">Impulsos y fondo de emergencia</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {EXTRAS.map((e) => (
                <label key={e.k} className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-tinta">{e.t}</span>
                  <Entrada inputMode="decimal" value={ex[e.k] ?? ""} onChange={(x) => setEx({ ...ex, [e.k]: x.target.value.replace(e.dias ? /\D/g : /[^\d.]/g, "") })} />
                  <span className="mt-1 block text-xs text-gris">{e.ayuda}</span>
                </label>
              ))}
            </div>
            <Boton className="mt-4" onClick={guardar} cargando={guardando} disabled={!cambioExtras && correo.trim() === c.correo_soporte}>Guardar configuración</Boton>
          </Tarjeta>

          <CobroVendiGoForm inicial={c.cobro_vendigo} correo={c.correo_soporte} alGuardar={recargar} />

          <Tarjeta titulo="Datos del proveedor (Libro de Reclamaciones)">
            <p className="-mt-2 mb-4 text-sm text-gris">Salen en cada hoja de reclamación. Usa los datos de tu RUC tal como figuran en SUNAT.</p>
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
              <label className="block"><span className="mb-1.5 block text-sm font-semibold text-tinta">Razón social o nombre del titular</span><Entrada value={pv.razon_social} onChange={(e) => setPv({ ...pv, razon_social: e.target.value })} maxLength={150} /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-semibold text-tinta">RUC</span><Entrada value={pv.ruc} inputMode="numeric" onChange={(e) => setPv({ ...pv, ruc: e.target.value.replace(/\D/g, "").slice(0, 11) })} /></label>
            </div>
            <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-tinta">Dirección fiscal</span><Entrada value={pv.direccion_fiscal} onChange={(e) => setPv({ ...pv, direccion_fiscal: e.target.value })} maxLength={200} /></label>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Boton onClick={guardarPv} cargando={guardandoPv} disabled={!prov.datos || JSON.stringify(pv) === JSON.stringify({ razon_social: prov.datos.razon_social, ruc: prov.datos.ruc, direccion_fiscal: prov.datos.direccion_fiscal })}>Guardar datos</Boton>
              <a href="/libro-reclamaciones" target="_blank" className="text-sm font-semibold text-pino underline">Ver Libro de Reclamaciones</a>
            </div>
          </Tarjeta>

          <Tarjeta titulo="Tiendas y entrega">
            <Fila titulo="Verificación de tiendas" detalle="Una tienda se muestra a los compradores recién cuando apruebas la identidad (DNI) de su dueña. El RUC es opcional y da la insignia “Negocio con RUC verificado”.">
              <Link href="/admin/vendedores" className={enlace}>Ver vendedores</Link>
            </Fila>
            <Fila titulo="Agencias de envío" detalle={c.agencias.length ? `${c.agencias.join(", ")} · ${c.sedes_activas} sedes activas` : "Aún no hay sedes"}>
              <Link href="/admin/agencias" className={enlace}>Editar</Link>
            </Fila>
            <Fila titulo="Ventas extra" detalle="Paquete de +20 ventas por S/ 5 para planes con límite.">
              <span className="text-sm font-bold text-tinta">Fijo</span>
            </Fila>
            <Fila titulo="Seguimiento GPS en tiempo real" detalle="Funcionalidad futura. No disponible en esta versión.">
              <span className="text-sm font-bold text-tinta">Próximamente</span>
            </Fila>
          </Tarjeta>

          <ServiciosAWS />

          <Tarjeta titulo="Seguridad y asistencia IA">
            <Fila titulo="Cierre de sesión por inactividad (admin)" detalle={`Después de ${c.inactividad_min} minutos sin actividad.`}>
              <Link href="/admin/seguridad" className={enlace}>Editar en Seguridad</Link>
            </Fila>
            <Fila titulo="Solo usar información del vendedor" detalle="Regla fija: la IA no inventa precios, stock ni políticas.">
              <span className="rounded-full bg-[#ebe7df] px-3 py-1 text-xs font-bold text-tinta">Siempre activo</span>
            </Fila>
            <Fila
              titulo="Límites de IA por plan"
              detalle={planes.datos ? planes.datos.planes.map((p) => `${p.nombre} ${p.creditos_ia.toLocaleString("es-PE")}`).join(" · ") + " créditos al mes" : "…"}
            >
              <Link href="/admin/planes" className={enlace}>Editar en Planes</Link>
            </Fila>
          </Tarjeta>
        </>
      )}
    </>
  );
}

type Sistema = {
  entorno: string;
  sms: { real: boolean; pendientes_24h: number; enviados_24h: number; con_error_24h: number };
  ia: { real: boolean; modelo: string };
  mercadopago: { configurado: boolean; prueba: boolean };
};

// Qué servicios están reales y cuáles simulados, y un SMS de prueba para comprobar Amazon SNS en vivo.
function ServiciosAWS() {
  const avisar = useAvisar();
  const { datos: s, recargar } = useApi<Sistema>("/admin/sistema");
  const [celular, setCelular] = useState("");
  const [enviando, setEnviando] = useState(false);
  if (!s) return null;
  const chip = (ok: boolean, si: string, no: string) => (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${ok ? "bg-pino-claro text-pino" : "bg-[#ebe7df] text-tinta"}`}>{ok ? si : no}</span>
  );
  async function probar() {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>("/admin/sistema/sms-prueba", { celular });
      avisar(r.mensaje);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Tarjeta titulo="Servicios (AWS y pagos)">
      <Fila titulo="SMS con Amazon SNS" detalle={`Últimas 24 h: ${s.sms.enviados_24h} enviados · ${s.sms.pendientes_24h} en cola · ${s.sms.con_error_24h} con error`}>
        {chip(s.sms.real, "Real", "Simulado (consola)")}
      </Fila>
      {s.sms.real && (
        <div className="flex flex-wrap items-center gap-2 border-b border-linea py-4">
          <Entrada inputMode="numeric" maxLength={9} value={celular} onChange={(e) => setCelular(e.target.value.replace(/\D/g, ""))} placeholder="Celular verificado en SNS" className="max-w-[220px]" />
          <Boton tamano="sm" cargando={enviando} disabled={celular.length !== 9} onClick={probar}>Enviar SMS de prueba</Boton>
          <span className="text-xs text-gris">En el sandbox de SNS solo llega a números verificados.</span>
        </div>
      )}
      <Fila titulo="IA con Amazon Bedrock" detalle={s.ia.real ? `Modelo ${s.ia.modelo}` : "Respuestas de ejemplo sin costo"}>
        {chip(s.ia.real, "Real", "Simulada")}
      </Fila>
      <Fila titulo="Mercado Pago (pagos de las tiendas)" detalle={s.mercadopago.configurado ? (s.mercadopago.prueba ? "Configurado en modo prueba" : "Configurado en producción") : "No configurado: la opción no aparece en las tiendas"}>
        {chip(s.mercadopago.configurado, "Configurado", "Apagado")}
      </Fila>
    </Tarjeta>
  );
}
