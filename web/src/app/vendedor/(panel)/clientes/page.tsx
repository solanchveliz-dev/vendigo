"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { FRECUENCIAS, celularBonito, iniciales, type Cliente } from "@/lib/clientes";
import { Cargando, Insignia, Vacio, cn } from "@/components/ui";

const POR_PAGINA = 20;

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Clientes: quiénes te compran y cada cuánto. Sale de tus pedidos.
export default function Clientes() {
  const { datos, error } = useApi<{ clientes: Cliente[] }>("/vendedor/clientes");
  const [q, setQ] = useState("");
  const [frecuencia, setFrecuencia] = useState("");
  const [pagina, setPagina] = useState(1);

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.clientes ?? []).filter(
      (c) => (!frecuencia || c.frecuencia === frecuencia) && (!t || c.nombre.toLowerCase().includes(t) || c.celular.includes(t.replace(/\s/g, ""))),
    );
  }, [datos, q, frecuencia]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Clientes</h1>
        <p className="text-sm text-gris">Quiénes te compran y cada cuánto.</p>
      </div>

      {error && !datos ? (
        <p className="text-sm text-gris">{error.message}</p>
      ) : !datos ? (
        <Cargando />
      ) : !datos.clientes.length ? (
        <Vacio icono={<Users className="size-6" />} titulo="Aún no tienes clientes" detalle="Cuando alguien te haga un pedido, aparecerá aquí con sus compras." />
      ) : (
        <section className="overflow-hidden rounded-[22px] bg-white shadow-suave ring-1 ring-linea/60">
          <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
            <label className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gris" />
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPagina(1); }}
                placeholder="Buscar cliente…"
                className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino"
              />
            </label>
            <select
              value={frecuencia}
              onChange={(e) => { setFrecuencia(e.target.value); setPagina(1); }}
              className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none focus:border-pino"
              aria-label="Frecuencia"
            >
              <option value="">Frecuencia: todos</option>
              {Object.entries(FRECUENCIAS).map(([k, f]) => (
                <option key={k} value={k}>{f.texto}</option>
              ))}
            </select>
            <span className="ml-auto text-sm text-gris">{lista.length} {lista.length === 1 ? "registro" : "registros"}</span>
          </div>

          {!lista.length ? (
            <p className="p-6 text-sm text-gris">No hay clientes con ese filtro.</p>
          ) : (
            <>
              {/* Tabla (computadora) */}
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-linea text-left text-xs font-semibold text-gris">
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3 text-right">Pedidos</th>
                    <th className="px-4 py-3 text-right">Compras</th>
                    <th className="px-4 py-3">Frecuencia</th>
                    <th className="px-4 py-3">Contacto</th>
                    <th className="px-4 py-3">Última compra</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c) => (
                    <tr key={c.id} className="relative border-b border-linea last:border-0 hover:bg-crema/40">
                      <td className="px-4 py-3.5">
                        <Link href={`/vendedor/clientes/${c.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-crema text-xs font-bold text-tinta">{iniciales(c.nombre)}</span>
                          <span>
                            <b className="block text-tinta">{c.nombre}</b>
                            {c.lugar && <span className="text-xs text-gris">{c.lugar}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-right">{c.pedidos}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-tinta">{soles(c.total_centimos)}</td>
                      <td className="px-4 py-3.5"><Insignia tono={FRECUENCIAS[c.frecuencia].tono}>{FRECUENCIAS[c.frecuencia].texto}</Insignia></td>
                      <td className="px-4 py-3.5">{celularBonito(c.celular)}</td>
                      <td className="px-4 py-3.5">{fechaCorta(c.ultima_compra)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Lista (celular) */}
              <div className="md:hidden">
                {visibles.map((c) => (
                  <Link key={c.id} href={`/vendedor/clientes/${c.id}`} className="flex items-center gap-3 border-b border-linea px-4 py-3.5 last:border-0">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-crema text-xs font-bold text-tinta">{iniciales(c.nombre)}</span>
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-tinta">{c.nombre}</b>
                      <span className="text-xs text-gris">
                        {c.pedidos} {c.pedidos === 1 ? "pedido" : "pedidos"} · {fechaCorta(c.ultima_compra)}
                      </span>
                    </span>
                    <span className="text-right">
                      <b className="block text-sm text-tinta">{soles(c.total_centimos)}</b>
                      <Insignia tono={FRECUENCIAS[c.frecuencia].tono}>{FRECUENCIAS[c.frecuencia].texto}</Insignia>
                    </span>
                  </Link>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-linea px-4 py-3 text-sm text-gris">
                <span>Mostrando {visibles.length} de {lista.length}</span>
                <span className="flex items-center gap-1.5">
                  <button onClick={() => setPagina(actual - 1)} disabled={actual === 1} className="grid size-8 place-items-center rounded-lg ring-1 ring-linea disabled:opacity-40" aria-label="Anterior">
                    <ChevronLeft className="size-4" />
                  </button>
                  {Array.from({ length: paginas }, (_, i) => i + 1).map((n) => (
                    <button key={n} onClick={() => setPagina(n)} className={cn("grid size-8 place-items-center rounded-lg text-sm font-semibold", n === actual ? "bg-pino text-white" : "ring-1 ring-linea")}>
                      {n}
                    </button>
                  ))}
                  <button onClick={() => setPagina(actual + 1)} disabled={actual === paginas} className="grid size-8 place-items-center rounded-lg ring-1 ring-linea disabled:opacity-40" aria-label="Siguiente">
                    <ChevronRight className="size-4" />
                  </button>
                </span>
              </div>
            </>
          )}
        </section>
      )}
      <p className="text-xs text-gris">
        <b>Nueva:</b> su primer pedido · <b>Ocasional:</b> 2 o 3 pedidos en un mismo mes · <b>Mensual:</b> vuelve en meses distintos · <b>Frecuente:</b> 4 pedidos o más.
      </p>
    </div>
  );
}
