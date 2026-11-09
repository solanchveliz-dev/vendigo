"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Boton, Cargando, Entrada, useAvisar } from "@/components/ui";
import { Tarjeta, Titulo } from "@/components/admin/ui";

type Config = { correo_soporte: string; inactividad_min: number; agencias: string[]; sedes_activas: number };
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
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { if (c) setCorreo(c.correo_soporte); }, [c]);

  async function guardar() {
    setGuardando(true);
    try {
      const r = await api.put<{ mensaje: string }>("/admin/configuracion", { correo_soporte: correo });
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
                <span className="mt-1 block text-xs text-gris">Culqi cobra en soles.</span>
              </label>
            </div>
            <Boton className="mt-4" onClick={guardar} cargando={guardando} disabled={correo.trim() === c.correo_soporte}>Guardar configuración</Boton>
          </Tarjeta>

          <Tarjeta titulo="Tiendas y entrega">
            <Fila titulo="Revisión de tiendas nuevas" detalle="Se publican al instante y quedan “En revisión” hasta que las apruebes.">
              <Link href="/admin/tiendas" className={enlace}>Ver tiendas</Link>
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
