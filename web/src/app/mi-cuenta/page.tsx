"use client";

import Link from "next/link";
import { ChevronRight, Search, Store } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { rubros } from "@/lib/catalogos";
import { Cargando } from "@/components/ui";
import { ENTREGA, EstadoPedido, Miniatura, Progreso, type PedidoComprador } from "@/components/comprador/ui";

type Resumen = { nombre: string; pedidos: number; en_curso: number; pedidos_en_curso: PedidoComprador[] };
type TiendaR = { id: string; nombre: string; slug: string; rubro: string; lugar: string; logo_url: string; descripcion: string };

function Seccion({ titulo, enlace, texto, children }: { titulo: string; enlace?: string; texto?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-[22px] font-extrabold text-tinta">{titulo}</h2>
        {enlace && <Link href={enlace} className="text-sm font-bold text-pino hover:underline">{texto}</Link>}
      </div>
      {children}
    </section>
  );
}

// Mi inicio del comprador (prototipo n.° 10): saludo con buscador, pedidos en curso y tiendas para descubrir.
export default function MiInicio() {
  const { datos } = useApi<Resumen>("/comprador/resumen");
  const sugeridas = useApi<{ tiendas: TiendaR[] }>("/buscar");
  if (!datos) return <Cargando />;
  const nombre = datos.nombre.split(" ")[0];

  return (
    <div className="space-y-9">
      <div className="relative overflow-hidden rounded-[28px] bg-pino px-6 py-9 text-white sm:px-10 sm:py-11">
        <span className="absolute -right-16 -top-20 size-64 rounded-full bg-coral/30 blur-2xl" />
        <span className="absolute -bottom-24 right-40 size-56 rounded-full bg-[#2f7a72]/50 blur-2xl" />
        <div className="relative max-w-[680px]">
          <h1 className="font-display text-[34px] font-extrabold leading-tight sm:text-[40px]">Hola, {nombre}</h1>
          <p className="mt-1 text-white/80">{datos.en_curso ? `Tienes ${datos.en_curso} ${datos.en_curso === 1 ? "pedido" : "pedidos"} en curso. ¿Qué buscas hoy?` : "¿Qué buscas hoy?"}</p>
          <form action="/buscar" className="mt-5 flex items-center gap-2 rounded-full bg-white py-1.5 pl-5 pr-1.5">
            <Search className="size-5 shrink-0 text-gris" />
            <input name="q" placeholder="Alfajores, aretes, polos…" className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-tinta outline-none placeholder:text-gris" />
            <button className="h-10 rounded-full bg-coral px-5 text-sm font-bold text-white">Buscar</button>
          </form>
        </div>
      </div>

      {datos.pedidos_en_curso.length > 0 && (
        <Seccion titulo="Tus pedidos en curso" enlace="/mi-cuenta/pedidos" texto="Ver todos">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {datos.pedidos_en_curso.map((p) => {
              const E = ENTREGA[p.entrega] ?? ENTREGA.recojo;
              return (
                <Link key={p.codigo} href={`/seguimiento/${p.token}`} className="space-y-3 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60 transition hover:ring-pino/40">
                  <div className="flex items-center justify-between gap-2">
                    <b className="truncate text-tinta">{p.tienda}</b>
                    <EstadoPedido p={p} />
                  </div>
                  <div className="flex items-center gap-3">
                    <Miniatura p={p} className="size-12 shrink-0" />
                    <p className="text-sm">
                      <b className="text-tinta">{p.codigo}</b>
                      <br />
                      <span className="text-gris">{soles(p.total_centimos)} · {E.t}</span>
                    </p>
                  </div>
                  <Progreso estado={p.estado} />
                </Link>
              );
            })}
          </div>
        </Seccion>
      )}

      {datos.pedidos === 0 && (
        <p className="rounded-2xl bg-white px-5 py-4 text-sm text-gris ring-1 ring-linea/60">
          Aún no tienes pedidos. Cuando compres en una tienda con este celular, tu pedido aparecerá aquí.
        </p>
      )}

      <Seccion titulo="Emprendedores que te pueden gustar" enlace="/buscar" texto="Buscar más">
        {!sugeridas.datos ? (
          <Cargando />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sugeridas.datos.tiendas.slice(0, 3).map((t) => (
              <Link key={t.id} href={`/t/${t.slug}`} className="flex items-center gap-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60 transition hover:ring-pino/40">
                {t.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logo_url} alt="" className="size-14 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-pino-claro text-pino"><Store className="size-6" /></span>
                )}
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-tinta">{t.nombre}</b>
                  <span className="block truncate text-sm text-gris">{rubros[t.rubro] ?? t.rubro}{t.lugar ? ` · ${t.lugar}` : ""}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-gris" />
              </Link>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Rubros">
        <div className="flex flex-wrap gap-2">
          {Object.entries(rubros).map(([k, t]) => (
            <Link key={k} href={`/buscar?rubro=${k}`} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-tinta ring-1 ring-linea transition hover:ring-pino">
              {t}
            </Link>
          ))}
        </div>
      </Seccion>
    </div>
  );
}
