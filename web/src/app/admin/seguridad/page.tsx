"use client";

import Link from "next/link";
import { Check, Lock, ShieldCheck, ShoppingBag, Store, X } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Cargando, useAvisar } from "@/components/ui";
import { Tarjeta, Titulo, useExportar } from "@/components/admin/ui";

type Datos = {
  inactividad_min: number;
  admins_sin_mfa: number;
  intentos: { tipo: "permiso" | "ingreso"; rol: string; nombre: string; ruta: string; motivo: string; ip: string; creado_en: string }[];
};

const ROLES = [
  { icono: ShoppingBag, t: "Comprador", d: "No puede entrar al panel administrativo ni al panel de vendedor." },
  { icono: Store, t: "Vendedor", d: "Gestiona solo su tienda. No accede a funciones administrativas." },
  { icono: ShieldCheck, t: "Administrador", d: "Supervisa la plataforma. No compra ni vende con esta cuenta." },
];

// Matriz de permisos: es la misma regla que la API aplica en cada ruta (rol comprador, vendedor o admin).
const PERMISOS: [string, boolean, boolean, boolean][] = [
  ["Comprar y pagar", true, false, false],
  ["Ver sus pedidos y conversaciones", true, true, false],
  ["Publicar y editar productos", false, true, false],
  ["Gestionar pedidos y registrar despachos", false, true, false],
  ["Usar asistencia IA", false, true, false],
  ["Informar pagos recibidos y devoluciones", false, true, false],
  ["Ver panel administrativo", false, false, true],
  ["Suspender tiendas y usuarios", false, false, true],
  ["Aprobar identidades y confirmar pagos a VendiGo", false, false, true],
  ["Resolver reclamos", false, false, true],
];

const ROL: Record<string, string> = { comprador: "Comprador", vendedor: "Vendedor", admin: "Administrador" };

export default function Seguridad() {
  const { datos, setDatos } = useApi<Datos>("/admin/seguridad");
  const avisar = useAvisar();
  useExportar("intentos-denegados", () => [
    ["Fecha", "Tipo", "Rol", "Usuario", "Detalle", "IP"],
    ...(datos?.intentos ?? []).map((i) => [i.creado_en.slice(0, 16).replace("T", " "), i.tipo === "permiso" ? "Sin permiso" : "Ingreso fallido", ROL[i.rol] ?? i.rol, i.nombre, i.ruta || i.motivo, i.ip]),
  ]);
  if (!datos) return <Cargando />;

  async function cambiarInactividad(min: number) {
    try {
      const r = await api.put<{ inactividad_min: number }>("/admin/ajustes", { inactividad_min: min });
      setDatos({ ...datos!, inactividad_min: r.inactividad_min });
      avisar(`Las sesiones de administrador se cerrarán tras ${r.inactividad_min} minutos sin uso.`);
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }

  return (
    <>
      <Titulo titulo="Seguridad, roles y permisos" detalle="Cada rol solo accede a lo que necesita." />
      <div className="grid gap-5 md:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r.t} className="rounded-[22px] bg-white p-6 ring-1 ring-linea/70">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-crema text-tinta"><r.icono className="size-5" /></span>
              <b className="text-lg text-tinta">{r.t}</b>
            </div>
            <p className="text-sm text-gris">{r.d}</p>
          </div>
        ))}
      </div>

      <section className="overflow-x-auto rounded-[22px] bg-white ring-1 ring-linea/70">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
              <th className="px-5 py-3.5">Permiso</th>
              <th className="px-5 py-3.5">Comprador</th>
              <th className="px-5 py-3.5">Vendedor</th>
              <th className="px-5 py-3.5">Administrador</th>
            </tr>
          </thead>
          <tbody>
            {PERMISOS.map(([p, ...roles]) => (
              <tr key={p} className="border-b border-linea last:border-0">
                <td className="px-5 py-3.5 text-tinta">{p}</td>
                {roles.map((ok, i) => (
                  <td key={i} className="px-5 py-3.5">{ok ? <Check className="size-4 text-tinta" /> : <X className="size-4 text-linea" />}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Tarjeta titulo="Seguridad de acceso">
          <div className="flex items-center justify-between gap-3 border-b border-linea py-4">
            <span>
              <b className="block text-tinta">Verificación en dos pasos para administradores</b>
              <span className="text-xs text-gris">
                {datos.admins_sin_mfa ? `${datos.admins_sin_mfa} administrador(es) la activarán en su próximo ingreso` : "Todos los administradores la tienen activa"}
              </span>
            </span>
            <span className="rounded-full bg-crema px-3 py-1 text-[13px] font-bold text-tinta">Obligatoria</span>
          </div>
          <div className="flex items-center justify-between gap-3 py-4">
            <b className="text-tinta">Cerrar sesiones inactivas</b>
            <select value={datos.inactividad_min} onChange={(e) => cambiarInactividad(Number(e.target.value))} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Cerrar sesiones inactivas">
              {[15, 30, 60].map((m) => (
                <option key={m} value={m}>{m} minutos</option>
              ))}
            </select>
          </div>
          <Link href="/admin/auditoria" className="text-sm font-semibold text-tinta underline">Ver registro de auditoría</Link>
        </Tarjeta>
        <Tarjeta titulo="Intentos de acceso denegados (24 h)">
          {!datos.intentos.length ? (
            <p className="text-sm text-gris">No hubo intentos denegados en las últimas 24 horas.</p>
          ) : (
            datos.intentos.slice(0, 6).map((i, n) => (
              <div key={n} className="flex items-center gap-3 border-b border-linea py-3 last:border-0">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><Lock className="size-[18px]" /></span>
                <span className="min-w-0 flex-1 text-sm text-tinta">
                  {ROL[i.rol] ?? i.rol} → {i.tipo === "permiso" ? i.ruta.replace("/api/v1", "") : i.motivo}
                  <span className="block text-xs text-gris">{i.nombre}{i.ip ? ` · IP ${i.ip}` : ""}</span>
                </span>
                <span className="text-xs text-gris">{new Date(i.creado_en).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
              </div>
            ))
          )}
          <Link href="/acceso-denegado" className="mt-3 inline-block text-sm font-semibold text-tinta underline">Ver pantalla de acceso denegado</Link>
        </Tarjeta>
      </div>
    </>
  );
}
