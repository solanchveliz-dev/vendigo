"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { VERIFICACION, fecha, type Vendedora } from "@/lib/admin";
import { Cargando, Insignia, cn } from "@/components/ui";

export default function Vendedoras() {
  const [q, setQ] = useState("");
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState("");
  useEffect(() => {
    setEstado(new URLSearchParams(window.location.search).get("estado") ?? "");
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setBuscar(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { datos } = useApi<{ vendedoras: Vendedora[] }>(`/admin/vendedores?q=${encodeURIComponent(buscar)}&estado=${estado}`);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold text-pino">Vendedoras</h1>
        <p className="text-sm text-gris">Supervisa las cuentas, su tienda y su actividad.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gris" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, celular, correo o tienda…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
        </label>
        <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-linea">
          {[["", "Todas"], ["activas", "Activas"], ["suspendidas", "Suspendidas"]].map(([k, t]) => (
            <button key={k} onClick={() => setEstado(k)} className={cn("h-9 rounded-full px-4 text-sm font-semibold", estado === k ? "bg-pino text-white" : "text-tinta")}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {!datos ? (
        <Cargando />
      ) : !datos.vendedoras.length ? (
        <p className="text-sm text-gris">No hay cuentas con ese filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-[22px] bg-white shadow-suave ring-1 ring-linea/60">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs font-semibold text-gris">
                <th className="px-4 py-3">Vendedora</th>
                <th className="px-4 py-3">Tienda</th>
                <th className="px-4 py-3">Identidad</th>
                <th className="px-4 py-3 text-right">Pedidos</th>
                <th className="px-4 py-3 text-right">Ventas</th>
                <th className="px-4 py-3">Registro</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {datos.vendedoras.map((v) => (
                <tr key={v.id} className="relative border-b border-linea last:border-0 hover:bg-crema/40">
                  <td className="px-4 py-3">
                    <Link href={`/admin/vendedoras/${v.id}`} className="after:absolute after:inset-0">
                      <b className="block text-tinta">{v.nombre}</b>
                      <span className="text-xs text-gris">{v.celular}{v.email ? ` · ${v.email}` : ""}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">{v.tienda || <span className="text-gris">Sin tienda</span>}<span className="block text-xs text-gris">{v.plan}</span></td>
                  <td className="px-4 py-3"><Insignia tono={VERIFICACION[v.verificacion]?.tono ?? "neutro"}>{VERIFICACION[v.verificacion]?.texto ?? v.verificacion}</Insignia></td>
                  <td className="px-4 py-3 text-right">{v.pedidos}</td>
                  <td className="px-4 py-3 text-right font-semibold">{soles(v.ventas_centimos)}</td>
                  <td className="px-4 py-3">{fecha(v.creado_en)}</td>
                  <td className="px-4 py-3">
                    {!v.activo ? <Insignia tono="error">Suspendida</Insignia> : v.bloqueada ? <Insignia tono="aviso">Bloqueo temporal</Insignia> : <Insignia tono="ok">Activa</Insignia>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
