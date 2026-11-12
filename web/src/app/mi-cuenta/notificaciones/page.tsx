"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Bell } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { fecha } from "@/lib/formato";
import { Cargando, cn } from "@/components/ui";
import { Titulo } from "@/components/admin/ui";
import { Vacio } from "@/components/comprador/ui";

type Aviso = { id: string; titulo: string; cuerpo: string; enlace: string; leida: boolean; creado_en: string };

// Notificaciones (prototipo n.° 25): cambios de sus pedidos y pagos. Al abrir la página quedan como leídas.
export default function Notificaciones() {
  const { datos } = useApi<{ notificaciones: Aviso[]; no_leidas: number }>("/comprador/notificaciones");
  useEffect(() => {
    if (datos?.no_leidas) api.post("/comprador/notificaciones/leer").catch(() => null);
  }, [datos?.no_leidas]);

  return (
    <div className="space-y-6">
      <Titulo titulo="Notificaciones" detalle="Pedidos, pagos y entregas. También te avisamos por SMS." />
      {!datos ? (
        <Cargando />
      ) : !datos.notificaciones.length ? (
        <Vacio titulo="No tienes notificaciones" texto="Cuando una tienda acepte, envíe o entregue tu pedido, te avisaremos aquí." />
      ) : (
        <div className="divide-y divide-linea overflow-hidden rounded-[22px] bg-white shadow-suave ring-1 ring-linea/60">
          {datos.notificaciones.map((a) => (
            <Link key={a.id} href={a.enlace || "/mi-cuenta/pedidos"} className={cn("flex gap-4 px-5 py-4 transition hover:bg-crema/50", !a.leida && "bg-pino-claro/30")}>
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", a.leida ? "bg-crema text-gris" : "bg-pino text-white")}><Bell className="size-[18px]" /></span>
              <span className="min-w-0 flex-1">
                <b className="block text-tinta">{a.titulo}</b>
                <span className="block text-sm text-gris">{a.cuerpo}</span>
                <span className="text-xs text-gris">{fecha(a.creado_en, true)}</span>
              </span>
              {!a.leida && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-coral" aria-label="Sin leer" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
