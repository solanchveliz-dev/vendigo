"use client";

import Link from "next/link";
import { use } from "react";
import { Check, ChevronRight, Eye, ShoppingBag, X } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { ESTADO_TIENDA, REPUTACION, RUBROS, VERIFICACION, type TiendaAdmin } from "@/lib/admin";
import { Cargando } from "@/components/ui";
import { Estado, Tarjeta, Titulo } from "@/components/admin/ui";
import { AccionTienda } from "@/components/admin/acciones-tienda";

type Detalle = {
  tienda: TiendaAdmin;
  info: { descripcion: string; horario: string; politicas: string; entrega: string[]; portada_url: string; reclamos: number; contacto_verificado: boolean; identidad: string };
  productos: { id: string; nombre: string; precio_centimos: number; imagen_url: string; activo: boolean }[];
};

export default function DetalleTienda({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: d, error, recargar } = useApi<Detalle>(`/admin/tiendas/${id}`);
  if (error && !d) return <p className="text-sm text-gris">No encontramos esta tienda.</p>;
  if (!d) return <Cargando />;
  const t = d.tienda;
  const est = ESTADO_TIENDA[t.estado];

  // Lista de revisión: se calcula con los datos reales de la tienda.
  const revision: [string, boolean][] = [
    ["Nombre y descripción claros", t.nombre.trim().length >= 3 && d.info.descripcion.trim().length >= 20],
    ["Logo propio", !!t.logo_url],
    ["Celular de contacto verificado", d.info.contacto_verificado],
    ["Identidad de la dueña verificada", d.info.identidad === "aprobada"],
    ["Al menos 1 producto publicado", t.productos > 0],
    ["Políticas de cambios", d.info.politicas.trim().length > 0],
  ];

  return (
    <>
      <Titulo
        migas={<><Link href="/admin/tiendas" className="hover:text-pino">Tiendas</Link> <ChevronRight className="size-3.5" /> {t.nombre}</>}
        titulo={t.nombre}
        detalle={`${RUBROS[t.rubro] ?? t.rubro} · ${t.lugar}`}
        accion={
          <div className="flex flex-wrap items-center gap-3">
            <Estado tono={est.tono}>{est.t}</Estado>
            <a href={`/t/${t.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-tinta ring-1 ring-linea">
              <Eye className="size-4" /> Ver pública
            </a>
            <AccionTienda t={t} alTerminar={recargar} grande />
          </div>
        }
      />
      {t.suspendida_motivo && <p className="rounded-2xl bg-error-claro px-5 py-3 text-sm text-error"><b>Suspendida:</b> {t.suspendida_motivo}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          <div className="relative h-36 overflow-hidden rounded-[22px] bg-[#e9e2d6] bg-cover bg-center" style={d.info.portada_url ? { backgroundImage: `url(${d.info.portada_url})` } : undefined}>
            {!d.info.portada_url && <div className="absolute -right-10 -top-24 size-72 rounded-full bg-[#7a8f88]" />}
          </div>
          <Tarjeta titulo="Información">
            <dl className="space-y-2.5 text-[15px]">
              {[
                ["Descripción", d.info.descripcion || "—"],
                ["Dueña", <Link key="d" href={`/admin/vendedores/${t.usuario_id}`} className="font-bold hover:text-pino">{t.dueno}</Link>],
                ["Horario", d.info.horario || "—"],
                ["Entrega", d.info.entrega.join(", ") || "—"],
                ["Políticas", d.info.politicas || "—"],
              ].map(([k, v]) => (
                <div key={String(k)} className="grid grid-cols-[150px_1fr] gap-3">
                  <dt className="text-gris">{k}</dt>
                  <dd className="text-tinta">{v}</dd>
                </div>
              ))}
            </dl>
          </Tarjeta>
          <Tarjeta titulo={`Productos (${d.productos.length})`}>
            {!d.productos.length ? (
              <p className="text-sm text-gris">Todavía no publicó productos.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {d.productos.map((p) => (
                  <a key={p.id} href={`/t/${t.slug}/p/${p.id}`} target="_blank" rel="noreferrer" className="group">
                    <span className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl bg-crema text-gris">
                      <ShoppingBag className="size-8" />
                      {p.imagen_url && (
                        <img src={p.imagen_url} alt={p.nombre} onError={(e) => (e.currentTarget.style.display = "none")} className="absolute inset-0 size-full object-cover transition group-hover:scale-105" />
                      )}
                    </span>
                    <span className="mt-2 block text-sm text-tinta">{p.nombre}</span>
                    <span className="text-xs text-gris">{soles(p.precio_centimos)}{!p.activo && " · oculto"}</span>
                  </a>
                ))}
              </div>
            )}
          </Tarjeta>
        </div>
        <div className="space-y-5">
          <Tarjeta titulo="Lista de revisión">
            <ul className="space-y-3">
              {revision.map(([txt, ok]) => (
                <li key={txt} className="flex items-center gap-3 text-sm text-tinta">
                  {ok ? <Check className="size-4 shrink-0 text-tinta" /> : <X className="size-4 shrink-0 text-error" />}
                  {txt}
                </li>
              ))}
            </ul>
          </Tarjeta>
          <Tarjeta titulo="Indicadores">
            <dl className="space-y-3 text-[15px]">
              <div className="flex justify-between"><dt className="text-tinta">Ventas</dt><dd className="font-bold text-tinta">{t.ventas.toLocaleString("es-PE")}</dd></div>
              <div className="flex justify-between"><dt className="text-tinta">Reputación</dt><dd className="font-bold text-tinta">{REPUTACION[t.reputacion] ?? t.reputacion}</dd></div>
              <div className="flex justify-between"><dt className="text-tinta">Reclamos</dt><dd className="font-bold text-tinta">{d.info.reclamos}</dd></div>
              <div className="flex justify-between"><dt className="text-tinta">Identidad</dt><dd className="font-bold text-tinta">{VERIFICACION[d.info.identidad]?.texto ?? d.info.identidad}</dd></div>
            </dl>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
