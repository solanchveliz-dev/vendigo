"use client";

import Link from "next/link";
import { ChevronRight, ClipboardList, Eye, Lock, MessageCircleQuestion, Package, Pencil, QrCode, Sparkles, Truck, Users } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import type { PedidoResumen, Producto, Tienda, UsoPlan } from "@/lib/tipos";
import { Boton, Cargando, Tarjeta, cn } from "@/components/ui";
import { usePanel } from "@/components/panel/contexto";
import { TablaPedidos } from "@/components/pedidos/tabla";

function Mosaico({ href, n, texto, tono }: { href: string; n: number; texto: string; tono: string }) {
  return (
    <Link href={href} className={cn("rounded-xl p-4 transition hover:brightness-95", tono)}>
      <p className="font-display text-3xl font-extrabold">{n}</p>
      <p className="text-sm">{texto}</p>
    </Link>
  );
}

function Indicador({ titulo, valor, detalle, icono, oscuro, href }: { titulo: string; valor: string; detalle: React.ReactNode; icono: React.ReactNode; oscuro?: boolean; href: string }) {
  return (
    <Link href={href} className={cn("relative overflow-hidden rounded-xl p-5 shadow-suave ring-1 transition hover:ring-pino/30", oscuro ? "bg-pino text-white ring-pino" : "bg-white ring-linea/60")}>
      <div className="flex items-start justify-between">
        <p className={cn("text-sm", oscuro ? "text-white/80" : "text-gris")}>{titulo}</p>
        <span className={cn("grid size-8 place-items-center rounded-lg", oscuro ? "bg-white/10" : "bg-crema text-pino")}>{icono}</span>
      </div>
      <p className="mt-3 font-display text-3xl font-extrabold">{valor}</p>
      <p className={cn("mt-1 text-xs", oscuro ? "text-white/70" : "text-gris")}>{detalle}</p>
    </Link>
  );
}

export default function Inicio() {
  const { resumen: r } = usePanel();
  const plan = useApi<UsoPlan>("/vendedor/plan");
  const tienda = useApi<Tienda>("/vendedor/tienda");
  const recientes = useApi<{ pedidos: PedidoResumen[] }>("/vendedor/pedidos?grupo=todos");
  const stock = useApi<{ productos: Producto[] }>("/vendedor/productos?filtro=stock_bajo");
  if (!r) return <Cargando />;

  const p = r.pedidos;
  const atencion = p.por_aceptar + p.por_enviar + p.recogen;
  const u = plan.datos;

  return (
    <div className="space-y-5 pt-2">
      <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl bg-pino px-6 py-7 text-white">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-white/70">Tu panel</p>
          <h1 className="mt-1 text-3xl font-extrabold">
            Haz crecer <span className="font-serif italic text-coral">lo que haces</span>
          </h1>
          <p className="mt-1 text-sm text-white/75">Tus pedidos llegan pagados y ordenados. Hoy solo atiende lo que te toca.</p>
        </div>
        <Link href="/vendedor/productos/nuevo">
          <Boton variante="acento">+ Publicar producto</Boton>
        </Link>
        <div className="absolute -right-10 -top-16 size-48 rounded-full bg-white/5" />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {tienda.datos && (
          <Link href="/vendedor/tienda/vista">
            <Boton variante="secundario" tamano="sm">
              <Eye className="size-4" /> Ver mi tienda
            </Boton>
          </Link>
        )}
        <Link href="/vendedor/pedidos">
          <Boton tamano="sm">Gestionar pedidos</Boton>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/vendedor/plan" className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-suave ring-1 ring-linea/60 hover:ring-pino/30">
          <span className="grid size-10 place-items-center rounded-xl bg-crema text-pino"><ClipboardList className="size-5" /></span>
          <span className="flex-1">
            <span className="block font-semibold">{u ? (u.ventas_limite === null ? `${u.ventas_usadas} ventas este mes` : `${u.ventas_usadas} de ${u.ventas_limite} ventas este mes`) : "…"}</span>
            <span className="block text-sm text-gris">Plan {u?.plan.nombre}</span>
          </span>
          <ChevronRight className="size-4 text-gris" />
        </Link>
        <Link href="/vendedor/cobros" className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-suave ring-1 ring-linea/60 hover:ring-pino/30">
          <span className="grid size-10 place-items-center rounded-xl bg-crema text-pino"><Lock className="size-5" /></span>
          <span className="flex-1">
            <span className="block font-semibold">{soles(r.saldos.a_liberar_centimos)} a liberar</span>
            <span className="block text-sm text-gris">Se libera al entregar · {soles(r.saldos.disponible_centimos)} disponible</span>
          </span>
          <ChevronRight className="size-4 text-gris" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador oscuro href="/vendedor/cobros" titulo="Ventas del mes" valor={soles(r.vendido_mes_centimos)} detalle={`Hoy: ${soles(r.vendido_hoy_centimos)}`} icono={<ClipboardList className="size-4" />} />
        <Indicador href="/vendedor/pedidos" titulo="Pedidos" valor={String(r.pedidos_mes)} detalle={`${atencion} necesitan tu atención`} icono={<ClipboardList className="size-4" />} />
        <Indicador href="/vendedor/pedidos?grupo=terminados" titulo="Clientes" valor={String(r.clientes)} detalle="Compraron en tu tienda" icono={<Users className="size-4" />} />
        <Indicador href="/vendedor/productos" titulo="Productos" valor={String(r.productos_publicados)} detalle={r.stock_bajo ? <span className="text-error">{r.stock_bajo} con stock bajo</span> : "Publicados"} icono={<Package className="size-4" />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Tarjeta>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-extrabold text-pino">Necesitan tu atención</h2>
              <span className="text-xs text-gris">Un toque en cada pedido</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mosaico href="/vendedor/pedidos?grupo=por_aceptar" n={p.por_aceptar} texto="Pedidos por aceptar" tono="bg-coral-claro text-tinta" />
              <Mosaico href="/vendedor/pedidos?grupo=por_enviar" n={p.por_enviar} texto="Pedidos por enviar" tono="bg-aviso-claro text-tinta" />
              <Mosaico href="/vendedor/pedidos?grupo=recogen" n={p.recogen} texto="Recogen en tienda" tono="bg-pino-claro text-tinta" />
              <Mosaico href="/vendedor/cobros#reclamos" n={r.reclamos_abiertos} texto="Reclamos por responder" tono="bg-arena text-tinta" />
            </div>
            {r.preguntas_pendientes > 0 && (
              <Link href="/vendedor/consultas" className="mt-3 flex items-center gap-2 rounded-xl bg-crema px-4 py-3 text-sm hover:bg-arena/60">
                <MessageCircleQuestion className="size-4 text-pino" /> {r.preguntas_pendientes} {r.preguntas_pendientes === 1 ? "pregunta" : "preguntas"} de clientes por responder
              </Link>
            )}
          </Tarjeta>

          <Tarjeta className="p-0">
            <div className="flex items-center justify-between px-5 pt-5">
              <h2 className="font-extrabold text-pino">Pedidos recientes</h2>
              <Link href="/vendedor/pedidos" className="text-sm font-semibold text-pino">Ver todos</Link>
            </div>
            {recientes.datos?.pedidos.length ? (
              <TablaPedidos pedidos={recientes.datos.pedidos.slice(0, 6)} compacta />
            ) : (
              <p className="px-5 py-6 text-sm text-gris">Aún no tienes pedidos. Comparte tu tienda para recibir los primeros.</p>
            )}
          </Tarjeta>
        </div>

        <div className="space-y-5">
          <Tarjeta>
            <h2 className="mb-3 font-extrabold text-pino">Acciones rápidas</h2>
            <div className="space-y-2">
              <Link href="/vendedor/tienda/compartir" className="flex h-11 items-center justify-center gap-2 rounded-full ring-1 ring-linea text-sm font-semibold text-pino hover:bg-crema">
                <QrCode className="size-4" /> Compartir tienda / QR
              </Link>
              <Link href="/vendedor/tienda/entrega" className="flex h-11 items-center justify-center gap-2 rounded-full ring-1 ring-linea text-sm font-semibold text-pino hover:bg-crema">
                <Truck className="size-4" /> Formas de entrega
              </Link>
              <Link href="/vendedor/ia" className="flex h-11 items-center justify-center gap-2 rounded-full ring-1 ring-linea text-sm font-semibold text-pino hover:bg-crema">
                <Sparkles className="size-4" /> Herramientas IA
              </Link>
            </div>
          </Tarjeta>

          <Tarjeta>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-extrabold text-pino">Stock bajo</h2>
              <Link href="/vendedor/productos?filtro=stock_bajo" className="text-sm font-semibold text-pino">Ver</Link>
            </div>
            {stock.datos?.productos.length ? (
              stock.datos.productos.slice(0, 4).map((x) => (
                <Link key={x.id} href={`/vendedor/productos/${x.id}`} className="flex items-center gap-3 py-2">
                  <span className="size-10 overflow-hidden rounded-lg bg-arena">{x.imagenes[0] && <img src={x.imagenes[0].url} alt="" className="size-full object-cover" />}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{x.nombre}</span>
                    <span className={cn("block text-xs", x.stock === 0 ? "text-error" : "text-gris")}>{x.stock === 0 ? "Agotado" : `Quedan ${x.stock}`}</span>
                  </span>
                  <Pencil className="size-4 text-gris" />
                </Link>
              ))
            ) : (
              <p className="text-sm text-gris">Todo tu stock está bien.</p>
            )}
          </Tarjeta>

          <Tarjeta>
            <h2 className="mb-3 font-extrabold text-pino">Ventas de los últimos 7 días</h2>
            <div className="flex h-28 items-end gap-2">
              {r.semana.map((d) => {
                const max = Math.max(1, ...r.semana.map((x) => x.total_centimos));
                return (
                  <div key={d.fecha} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-md bg-coral" style={{ height: `${Math.max(4, (d.total_centimos / max) * 88)}px` }} title={soles(d.total_centimos)} />
                    <span className="text-[11px] text-gris">{new Date(d.fecha + "T12:00:00").toLocaleDateString("es-PE", { weekday: "short" })}</span>
                  </div>
                );
              })}
            </div>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
