"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useApi } from "@/lib/api";
import { ESTADO_USUARIO, ROLES, fecha, type UsuarioAdmin } from "@/lib/admin";
import { Cargando, cn } from "@/components/ui";
import { Avatar, Estado, Paginacion, Titulo, useExportar } from "@/components/admin/ui";

const POR_PAGINA = 20;

export default function Usuarios() {
  const { datos } = useApi<{ usuarios: UsuarioAdmin[] }>("/admin/usuarios");
  const [q, setQ] = useState("");
  const [rol, setRol] = useState("");
  const [estado, setEstado] = useState("");
  const [pagina, setPagina] = useState(1);
  useEffect(() => {
    setQ(new URLSearchParams(window.location.search).get("q") ?? "");
  }, []);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.usuarios ?? []).filter(
      (u) => (!rol || u.rol === rol) && (!estado || u.estado === estado) && (!t || [u.nombre, u.email, u.celular].some((x) => x.toLowerCase().includes(t))),
    );
  }, [datos, q, rol, estado]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("usuarios", () => [
    ["Usuario", "Correo", "Celular", "Rol", "Ciudad", "Registro", "Estado"],
    ...lista.map((u) => [u.nombre, u.email, u.celular, ROLES[u.rol]?.t ?? u.rol, u.ciudad, u.creado_en.slice(0, 10), ESTADO_USUARIO[u.estado]?.t ?? u.estado]),
  ]);

  return (
    <>
      <Titulo titulo="Usuarios" detalle="Todas las cuentas de la plataforma." />
      {!datos ? (
        <Cargando />
      ) : (
        <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
          <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
            <label className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar por nombre o correo…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
            </label>
            <select value={rol} onChange={(e) => { setRol(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Rol">
              <option value="">Rol: todos</option>
              {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.t}</option>)}
            </select>
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
              <option value="">Estado: todos</option>
              {Object.entries(ESTADO_USUARIO).map(([k, e]) => <option key={k} value={k}>{e.t}</option>)}
            </select>
            <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
          </div>
          {!lista.length ? (
            <p className="p-6 text-sm text-gris">No hay usuarios con ese filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                    <th className="px-5 py-3.5">Usuario</th>
                    <th className="px-5 py-3.5">Rol</th>
                    <th className="px-5 py-3.5">Ciudad</th>
                    <th className="px-5 py-3.5">Registro</th>
                    <th className="px-5 py-3.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((u) => (
                    <tr key={u.id} className="border-b border-linea last:border-0 hover:bg-crema/40">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/usuarios/${u.id}`} className="flex items-center gap-3">
                          <Avatar nombre={u.nombre} className={u.rol === "vendedor" ? "" : u.rol === "admin" ? "bg-coral-claro text-tinta" : "bg-crema text-tinta"} />
                          <span>
                            <b className="block text-tinta">{u.nombre}</b>
                            <span className="text-xs text-gris">{u.email || u.celular}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn("inline-block rounded-full px-2.5 py-1 text-[13px] font-bold", ROLES[u.rol]?.clase)}>{ROLES[u.rol]?.t ?? u.rol}</span>
                      </td>
                      <td className="px-5 py-3.5 text-tinta">{u.ciudad || "—"}</td>
                      <td className="px-5 py-3.5 text-tinta">{fecha(u.creado_en)}</td>
                      <td className="px-5 py-3.5"><Estado tono={ESTADO_USUARIO[u.estado]?.tono ?? "neutro"}>{ESTADO_USUARIO[u.estado]?.t ?? u.estado}</Estado></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion total={lista.length} visibles={visibles.length} pagina={actual} paginas={paginas} cambiar={setPagina} />
        </section>
      )}
    </>
  );
}
