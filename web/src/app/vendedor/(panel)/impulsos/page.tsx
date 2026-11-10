"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, MousePointerClick, Rocket } from "lucide-react";
import { useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";
import { Boton, Cargando, Selector, cn } from "@/components/ui";

type Impulso = {
  producto_id: string; nombre: string; imagen_url: string; estado: "activo" | "pendiente" | "terminado";
  dias: number; inicio: string | null; fin: string | null; impresiones: number; visitas: number; monto_centimos: number;
};

const ESTADO = {
  activo: { t: "Impulsando", c: "bg-pino-claro text-pino" },
  pendiente: { t: "Pagado, activándose", c: "bg-aviso-claro text-aviso" },
  terminado: { t: "Terminado", c: "bg-arena text-gris" },
};

// Impulsos de la tienda con sus números reales: veces que se mostró y visitas al producto.
export default function Impulsos() {
  const router = useRouter();
  const { datos } = useApi<{ impulsos: Impulso[] }>("/vendedor/destacados");
  const prods = useApi<{ productos: Producto[] }>("/vendedor/productos?filtro=activos");
  const [elegido, setElegido] = useState("");
  if (!datos) return <Cargando />;

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[28px] font-extrabold leading-tight text-pino">Impulsar productos</h1>
        <p className="mt-1 text-sm text-gris">Tu producto sale primero cuando alguien busca algo relacionado en VendiGo. Pagas a VendiGo con el método que prefieras y lo registras aquí.</p>
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
        <span className="grid size-11 place-items-center rounded-xl bg-pino text-white"><Rocket className="size-5" /></span>
        <div className="min-w-[220px] flex-1">
          <p className="mb-1.5 text-sm font-semibold text-tinta">¿Qué producto quieres impulsar?</p>
          <Selector value={elegido} onChange={(e) => setElegido(e.target.value)}>
            <option value="">Elige un producto</option>
            {(prods.datos?.productos ?? []).filter((x) => x.stock > 0).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
          </Selector>
        </div>
        <Boton disabled={!elegido} onClick={() => router.push(`/vendedor/productos/${elegido}/impulsar`)}>Impulsar</Boton>
      </section>

      <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
        <h2 className="mb-2 font-extrabold text-tinta">Tus impulsos</h2>
        {!datos.impulsos.length ? (
          <p className="py-4 text-sm text-gris">Todavía no impulsaste productos.</p>
        ) : (
          datos.impulsos.map((x, i) => (
            <Link key={i} href={`/vendedor/productos/${x.producto_id}`} className="flex flex-wrap items-center gap-3 border-b border-linea py-3.5 last:border-0 hover:bg-crema/40">
              {x.imagen_url ? <img src={x.imagen_url} alt="" className="size-12 rounded-xl object-cover" /> : <span className="size-12 rounded-xl bg-crema" />}
              <span className="min-w-0 flex-1 text-sm">
                <b className="block truncate text-tinta">{x.nombre}</b>
                <span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold", ESTADO[x.estado].c)}>{ESTADO[x.estado].t}</span>
                <span className="ml-2 text-xs text-gris">
                  {x.dias} días · {soles(x.monto_centimos)}
                  {x.fin && ` · ${x.estado === "activo" ? "hasta" : "terminó"} el ${fecha(x.fin)}`}
                </span>
              </span>
              {x.estado !== "pendiente" && (
                <span className="flex gap-4 text-sm">
                  <span className="text-center"><b className="flex items-center gap-1 text-tinta"><Eye className="size-4" /> {x.impresiones.toLocaleString("es-PE")}</b><span className="text-xs text-gris">se mostró</span></span>
                  <span className="text-center"><b className="flex items-center gap-1 text-tinta"><MousePointerClick className="size-4" /> {x.visitas.toLocaleString("es-PE")}</b><span className="text-xs text-gris">lo abrieron</span></span>
                </span>
              )}
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
