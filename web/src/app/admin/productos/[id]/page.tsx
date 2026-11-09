"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ChevronRight, Eye, Package } from "lucide-react";
import { useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import { ESTADO_PRODUCTO, RUBROS, type ProductoAdmin } from "@/lib/admin";
import { Cargando, cn } from "@/components/ui";
import { Estado, Tarjeta, Titulo } from "@/components/admin/ui";
import { AccionProducto } from "@/components/admin/acciones-producto";

type Detalle = {
  producto: ProductoAdmin;
  info: { descripcion: string; vendidos: number; visitas: number; reclamos: number; variantes: string[]; imagenes: string[]; retirado_en: string | null };
};

export default function DetalleProducto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: d, error, recargar } = useApi<Detalle>(`/admin/productos/${id}`);
  const [foto, setFoto] = useState(0);
  if (error && !d) return <p className="text-sm text-gris">No encontramos este producto.</p>;
  if (!d) return <Cargando />;
  const p = d.producto;
  const est = ESTADO_PRODUCTO[p.estado];
  const imgs = d.info.imagenes;
  const precioFinal = p.oferta_pct ? Math.floor((p.precio_centimos * (100 - p.oferta_pct)) / 100 / 10) * 10 : p.precio_centimos;

  const filas: [string, React.ReactNode][] = [
    ["Precio", p.oferta_pct ? <>{soles(precioFinal)} <s className="ml-1 text-gris">{soles(p.precio_centimos)}</s></> : soles(p.precio_centimos)],
    ["Stock", p.stock],
    ["Categoría", `${RUBROS[p.rubro] ?? p.rubro}${p.categoria ? ` · ${p.categoria}` : ""}`],
    ["Variantes", d.info.variantes.join(", ") || "—"],
    ["Vendidos", d.info.vendidos.toLocaleString("es-PE")],
    ["Visitas", d.info.visitas.toLocaleString("es-PE")],
    ["Reclamos", d.info.reclamos],
    ["Publicado", fecha(p.creado_en)],
    ["Descripción", d.info.descripcion || "—"],
  ];

  return (
    <>
      <Titulo
        migas={<><Link href="/admin/productos" className="hover:text-pino">Productos</Link> <ChevronRight className="size-3.5" /> {p.nombre}</>}
        titulo={p.nombre}
        detalle={<Link href={`/admin/tiendas/${p.tienda_id}`} className="hover:text-pino">{p.tienda}</Link>}
        accion={
          <div className="flex flex-wrap items-center gap-3">
            <Estado tono={est.tono}>{est.t}</Estado>
            {p.estado !== "retirado" && p.estado !== "pausado" && (
              <a href={`/t/${p.slug}/p/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-tinta ring-1 ring-linea">
                <Eye className="size-4" /> Ver publicación
              </a>
            )}
            <AccionProducto p={p} alTerminar={recargar} />
          </div>
        }
      />
      {p.retirado_motivo && (
        <p className="rounded-2xl bg-error-claro px-5 py-3 text-sm text-error">
          <b>Retirada{d.info.retirado_en ? ` el ${fecha(d.info.retirado_en)}` : ""}:</b> {p.retirado_motivo}
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div>
          <div className="relative grid aspect-square place-items-center overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
            <Package className="size-12 text-tinta/20" />
            {imgs[foto] && <img src={imgs[foto]} alt={p.nombre} onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 size-full object-contain p-4" />}
            {p.oferta_pct > 0 && <span className="absolute left-3 top-3 rounded-full bg-coral px-2.5 py-1 text-xs font-bold text-white">-{p.oferta_pct}%</span>}
          </div>
          {imgs.length > 1 && (
            <div className="mt-3 flex gap-2">
              {imgs.map((u, i) => (
                <button key={u} onClick={() => setFoto(i)} className={cn("size-16 overflow-hidden rounded-xl bg-white ring-2", i === foto ? "ring-pino" : "ring-linea/70")}>
                  <img src={u} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <Tarjeta>
          <dl className="space-y-3 text-[15px]">
            {filas.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[130px_1fr] gap-3">
                <dt className="text-gris">{k}</dt>
                <dd className="text-tinta">{v}</dd>
              </div>
            ))}
          </dl>
        </Tarjeta>
      </div>
    </>
  );
}
