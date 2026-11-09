"use client";

import { useState } from "react";
import { useApi } from "@/lib/api";
import { ACCIONES, fechaHora, type Evento } from "@/lib/admin";
import { Cargando, Insignia, cn } from "@/components/ui";
import { Titulo, useExportar } from "@/components/admin/ui";

function detalle(datos: string) {
  if (!datos) return "";
  try {
    return Object.entries(JSON.parse(datos) as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === "number" && k === "monto" ? `S/ ${(v / 100).toFixed(2)}` : v}`)
      .join(" · ");
  } catch {
    return "";
  }
}

// Registro de lo que hace cada persona con dinero, reclamos, identidades y cuentas.
export default function Auditoria() {
  const [soloAdmin, setSoloAdmin] = useState(true);
  const { datos } = useApi<{ eventos: Evento[] }>(`/admin/auditoria?quien=${soloAdmin ? "admin" : ""}`);
  useExportar("auditoria", () => [["Fecha", "Quién", "Rol", "Acción", "Detalle"], ...(datos?.eventos ?? []).map((e) => [e.creado_en.slice(0, 16).replace("T", " "), e.usuario, e.rol, ACCIONES[e.accion] ?? e.accion, detalle(e.datos)])]);
  return (
    <div className="space-y-5">
      <Titulo titulo="Auditoría" detalle="Quién hizo qué y cuándo. No se puede editar ni borrar." />
      <div className="flex w-fit gap-1 rounded-full bg-white p-1 ring-1 ring-linea">
        {[[true, "Administradores"], [false, "Todos"]].map(([k, t]) => (
          <button key={String(k)} onClick={() => setSoloAdmin(k as boolean)} className={cn("h-9 rounded-full px-4 text-sm font-semibold", soloAdmin === k ? "bg-pino text-white" : "text-tinta")}>
            {t as string}
          </button>
        ))}
      </div>
      {!datos ? (
        <Cargando />
      ) : !datos.eventos.length ? (
        <p className="text-sm text-gris">Aún no hay acciones registradas.</p>
      ) : (
        <div className="overflow-x-auto rounded-[22px] bg-white ring-1 ring-linea/70">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs font-semibold text-gris">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Quién</th>
                <th className="px-4 py-3">Acción</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {datos.eventos.map((e) => (
                <tr key={e.id} className="border-b border-linea last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-gris">{fechaHora(e.creado_en)}</td>
                  <td className="px-4 py-3">
                    {e.usuario} {e.rol === "admin" && <Insignia tono="pino">admin</Insignia>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-tinta">{ACCIONES[e.accion] ?? e.accion}</td>
                  <td className="px-4 py-3 text-xs text-gris">{detalle(e.datos) || `${e.entidad} ${e.entidad_id.slice(0, 8)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
