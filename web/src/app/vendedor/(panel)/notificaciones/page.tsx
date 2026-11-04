"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Bell } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { hace } from "@/lib/formato";
import { Cargando, Encabezado, Tarjeta, Vacio, cn } from "@/components/ui";
import { usePanel } from "@/components/panel/contexto";

type N = { id: string; titulo: string; cuerpo: string; enlace: string; leida: boolean; creado_en: string };

export default function Notificaciones() {
  const { datos } = useApi<{ notificaciones: N[] }>("/vendedor/notificaciones");
  const { recargarResumen } = usePanel();
  useEffect(() => {
    if (datos?.notificaciones.some((n) => !n.leida)) api.post("/vendedor/notificaciones/leer").then(recargarResumen).catch(() => null);
  }, [datos, recargarResumen]);
  if (!datos) return <Cargando />;
  return (
    <div className="max-w-2xl">
      <Encabezado titulo="Notificaciones" />
      {!datos.notificaciones.length ? (
        <Vacio icono={<Bell className="size-6" />} titulo="Sin notificaciones" detalle="Te avisaremos de pedidos nuevos, reclamos y pagos liberados." />
      ) : (
        <Tarjeta className="divide-y divide-linea p-0">
          {datos.notificaciones.map((n) => (
            <Link key={n.id} href={n.enlace || "#"} className={cn("flex gap-3 px-4 py-3.5 hover:bg-crema/60", !n.leida && "bg-coral-claro/40")}>
              <span className={cn("mt-2 size-2 shrink-0 rounded-full", n.leida ? "bg-transparent" : "bg-coral")} />
              <span className="flex-1">
                <span className="block font-semibold">{n.titulo}</span>
                <span className="block text-sm text-gris">{n.cuerpo}</span>
              </span>
              <span className="shrink-0 text-xs text-gris">{hace(n.creado_en)}</span>
            </Link>
          ))}
        </Tarjeta>
      )}
    </div>
  );
}
