"use client";

import Image from "next/image";
import Link from "next/link";
import { use } from "react";
import { ChevronRight, Printer } from "lucide-react";
import { useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import type { Tienda } from "@/lib/tipos";
import { Boton, Cargando } from "@/components/ui";
import { METODOS, type PagoPlan } from "@/lib/pagos-plan";

// Comprobante imprimible de un pago del plan.
export default function Comprobante({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pagos = useApi<{ pagos: PagoPlan[] }>("/vendedor/plan/pagos");
  const tienda = useApi<Tienda>("/vendedor/tienda");
  if (!pagos.datos || !tienda.datos) return <Cargando />;
  const p = pagos.datos.pagos.find((x) => x.id === id);
  if (!p || p.estado !== "confirmado") return <p className="text-sm text-gris">Este pago todavía no está confirmado por VendiGo.</p>;
  const numero = `VG-${p.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  return (
    <div className="space-y-5">
      <p className="no-imprimir flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/plan" className="hover:text-pino">Tu suscripción</Link> <ChevronRight className="size-3.5" />
        <Link href="/vendedor/plan/pagos" className="hover:text-pino">Pagos</Link> <ChevronRight className="size-3.5" /> Constancia
      </p>
      <div className="max-w-xl rounded-[22px] bg-white p-8 shadow-suave ring-1 ring-linea/60">
        <div className="flex items-start justify-between gap-4 border-b border-linea pb-5">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="VendiGo" width={36} height={36} />
            <b className="font-display text-xl text-pino">VendiGo</b>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold">Constancia de pago</p>
            <p className="text-gris">N.° {numero}</p>
          </div>
        </div>
        <div className="space-y-2 py-5 text-sm">
          <div className="flex justify-between"><span className="text-gris">Tienda</span><b>{tienda.datos.nombre}</b></div>
          <div className="flex justify-between"><span className="text-gris">Fecha</span><span>{fecha(p.fecha, true)}</span></div>
          <div className="flex justify-between"><span className="text-gris">Método</span><span>{METODOS[p.metodo] ?? p.metodo}</span></div>
          {p.referencia && <div className="flex justify-between"><span className="text-gris">N.° de operación</span><span>{p.referencia}</span></div>}
        </div>
        <div className="flex justify-between border-y border-linea py-4 text-sm">
          <span>{p.concepto}</span>
          <b>{soles(p.monto_centimos)}</b>
        </div>
        <div className="flex items-baseline justify-between pt-4">
          <span className="font-display text-lg font-extrabold">Total pagado</span>
          <span className="font-display text-2xl font-extrabold text-pino">{soles(p.monto_centimos)}</span>
        </div>
      </div>
      <p className="max-w-xl text-xs text-gris">Constancia interna del pago de tu plan. No reemplaza una boleta o factura electrónica.</p>
      <Boton className="no-imprimir" variante="secundario" onClick={() => window.print()}><Printer className="size-4" /> Imprimir</Boton>
    </div>
  );
}
