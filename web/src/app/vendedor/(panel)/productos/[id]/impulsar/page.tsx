"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Eye, Rocket, Search, Sparkles, Store } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";
import { Aviso, Boton, Cargando, cn, useAvisar } from "@/components/ui";
import { PagarAVendiGo } from "@/components/panel/pagar-vendigo";
import type { PagoVendiGo } from "@/lib/pagos-plan";

type Datos = {
  paquetes: { dias: number; precio_centimos: number }[];
  impulsos: { producto_id: string; estado: "activo" | "pendiente" | "terminado"; fin: string | null }[];
  pago_vendigo: PagoVendiGo;
};

// Impulsar un producto (como en Marketplace): se elige cuántos días, se yapea a VendiGo y se registra el pago aquí mismo.
export default function Impulsar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const avisar = useAvisar();
  const { datos: p } = useApi<Producto>(`/vendedor/productos/${id}`);
  const { datos: d } = useApi<Datos>("/vendedor/destacados");
  const [dias, setDias] = useState(7);
  const [paso, setPaso] = useState<1 | 2>(1);

  if (!p || !d) return <Cargando />;
  const paquete = d.paquetes.find((x) => x.dias === dias) ?? d.paquetes[0];
  const pendiente = d.impulsos.some((x) => x.producto_id === id && x.estado === "pendiente");
  const final = p.oferta?.precio_final_centimos ?? p.precio_centimos;

  async function pagar(metodo: string, referencia: string) {
    const r = await api.post<{ mensaje: string }>(`/vendedor/productos/${id}/destacar`, { dias: paquete.dias, metodo, referencia });
    avisar(r.mensaje);
    router.push("/vendedor/impulsos");
  }

  return (
    <div className="max-w-4xl">
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/productos" className="hover:text-tinta">Productos</Link>
        <ChevronRight className="size-3.5" />
        <Link href={`/vendedor/productos/${id}`} className="hover:text-tinta">{p.nombre}</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-tinta">Impulsar</span>
      </nav>
      <div className="mb-6">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[28px] font-extrabold leading-tight text-pino">Impulsa tu producto</h1>
        <p className="mt-1 text-sm text-gris">Haz que más personas lo vean: sale primero cuando buscan algo relacionado en VendiGo.</p>
      </div>

      {!p.activo || p.stock <= 0 ? (
        <Aviso tono="aviso">Solo puedes impulsar productos publicados y con stock.</Aviso>
      ) : pendiente ? (
        <Aviso tono="aviso">Este producto ya tiene un impulso esperando que VendiGo confirme tu pago. Te avisamos apenas se active.</Aviso>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            {paso === 1 ? (
              <>
                <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
                  <h2 className="mb-3 font-extrabold text-tinta">¿Cuántos días?</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {d.paquetes.map((x) => (
                      <button
                        key={x.dias}
                        type="button"
                        onClick={() => setDias(x.dias)}
                        className={cn("rounded-2xl p-4 text-left ring-1 transition", dias === x.dias ? "bg-pino-claro/50 ring-2 ring-pino" : "bg-white ring-linea hover:ring-pino/40")}
                      >
                        <b className="block text-tinta">{x.dias} días</b>
                        <span className="font-display text-2xl font-extrabold text-tinta">{soles(x.precio_centimos)}</span>
                        <span className="block text-xs text-gris">{soles(Math.round(x.precio_centimos / x.dias))} por día</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
                  <h2 className="mb-3 font-extrabold text-tinta">Dónde aparece</h2>
                  <ul className="space-y-3 text-sm text-tinta">
                    <li className="flex gap-3"><Search className="mt-0.5 size-4 shrink-0 text-pino" /> Primero en los resultados cuando alguien busca algo relacionado (por su nombre, categoría o descripción).</li>
                    <li className="flex gap-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-pino" /> En “Destacados” de VendiGo, con la etiqueta “Destacado”.</li>
                    <li className="flex gap-3"><Store className="mt-0.5 size-4 shrink-0 text-pino" /> Primero en tu tienda.</li>
                    <li className="flex gap-3"><Eye className="mt-0.5 size-4 shrink-0 text-pino" /> Verás cuántas veces se mostró y cuántas personas lo abrieron.</li>
                  </ul>
                </section>
              </>
            ) : (
              <PagarAVendiGo concepto={`Impulsar ${paquete.dias} días`} monto={paquete.precio_centimos} vendigo={d.pago_vendigo} alPagar={pagar} boton="Ya pagué, impulsar" />
            )}
          </div>

          <aside className="space-y-3 lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-widest text-gris">Así se verá</p>
            <div className="overflow-hidden rounded-2xl bg-white shadow-suave ring-1 ring-linea/60">
              <div className="relative aspect-square bg-arena">
                {p.imagenes[0] && <img src={p.imagenes[0].url} alt="" className="size-full object-cover" />}
                <span className="absolute right-2.5 top-2.5 rounded-md bg-pino px-2 py-0.5 text-xs font-bold text-white">Destacado</span>
              </div>
              <div className="p-3.5">
                <p className="truncate text-sm font-semibold text-tinta">{p.nombre}</p>
                <p className="font-display font-extrabold text-tinta">{soles(final)}</p>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-4 text-sm shadow-suave ring-1 ring-linea/60">
              <div className="flex justify-between"><span className="text-gris">Impulso</span><b>{paquete.dias} días</b></div>
              <div className="flex justify-between"><span className="text-gris">Termina aprox.</span><span>{fecha(new Date(Date.now() + paquete.dias * 864e5).toISOString())}</span></div>
              <div className="mt-2 flex justify-between border-t border-linea pt-2 text-lg font-extrabold"><span>Total</span><span>{soles(paquete.precio_centimos)}</span></div>
            </div>
            {paso === 1 ? (
              <Boton bloque tamano="lg" onClick={() => setPaso(2)}><Rocket className="size-4" /> Continuar al pago</Boton>
            ) : (
              <>
                <Boton bloque variante="secundario" onClick={() => setPaso(1)}>Volver</Boton>
              </>
            )}
            <p className="text-xs text-gris">Lo que pagas por impulsos va al fondo de emergencia de VendiGo, que ayuda a compradores y tiendas cuando un pedido no llega.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
