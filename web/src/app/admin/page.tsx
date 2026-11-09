"use client";

import Link from "next/link";
import { BadgeCheck, Banknote, Lock, ShieldAlert, UserPlus, Users, UserX } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { Cargando } from "@/components/ui";

type Resumen = {
  vendedoras: number;
  suspendidas: number;
  nuevas_semana: number;
  verificaciones_pendientes: number;
  retiros_pendientes: number;
  retiros_pendientes_centimos: number;
  reclamos_abiertos: number;
  cuentas_bloqueadas: number;
};

function Tarjeta({ href, titulo, valor, detalle, icono, alerta }: { href: string; titulo: string; valor: string; detalle: string; icono: React.ReactNode; alerta?: boolean }) {
  return (
    <Link href={href} className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60 transition hover:ring-pino/40">
      <div className="flex items-start justify-between">
        <p className="text-sm text-gris">{titulo}</p>
        <span className={alerta ? "grid size-9 place-items-center rounded-xl bg-coral text-white" : "grid size-9 place-items-center rounded-xl bg-crema text-tinta"}>{icono}</span>
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold text-tinta">{valor}</p>
      <p className="text-xs text-gris">{detalle}</p>
    </Link>
  );
}

export default function AdminInicio() {
  const { datos: r } = useApi<Resumen>("/admin/resumen");
  if (!r) return <Cargando />;
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold text-pino">Resumen</h1>
        <p className="text-sm text-gris">Lo que necesita tu revisión hoy.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tarjeta href="/admin/identidades" titulo="Identidades por revisar" valor={String(r.verificaciones_pendientes)} detalle="DNI y selfie enviados" icono={<BadgeCheck className="size-[18px]" />} alerta={r.verificaciones_pendientes > 0} />
        <Tarjeta href="/admin/retiros" titulo="Retiros por transferir" valor={String(r.retiros_pendientes)} detalle={`${soles(r.retiros_pendientes_centimos)} en total`} icono={<Banknote className="size-[18px]" />} alerta={r.retiros_pendientes > 0} />
        <Tarjeta href="/admin/reclamos" titulo="Reclamos abiertos" valor={String(r.reclamos_abiertos)} detalle="Esperan respuesta o decisión" icono={<ShieldAlert className="size-[18px]" />} alerta={r.reclamos_abiertos > 0} />
        <Tarjeta href="/admin/vendedoras" titulo="Vendedoras" valor={String(r.vendedoras)} detalle="Cuentas registradas" icono={<Users className="size-[18px]" />} />
        <Tarjeta href="/admin/vendedoras" titulo="Nuevas esta semana" valor={String(r.nuevas_semana)} detalle="Últimos 7 días" icono={<UserPlus className="size-[18px]" />} />
        <Tarjeta href="/admin/vendedoras?estado=suspendidas" titulo="Suspendidas · bloqueadas" valor={`${r.suspendidas} · ${r.cuentas_bloqueadas}`} detalle="Bloqueo temporal por intentos fallidos" icono={r.suspendidas ? <UserX className="size-[18px]" /> : <Lock className="size-[18px]" />} />
      </div>
    </div>
  );
}
