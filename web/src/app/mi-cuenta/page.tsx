"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Bike, MapPin, Package, Search, ShoppingBag, Star, Store } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { rubros } from "@/lib/catalogos";
import { Cargando, cn } from "@/components/ui";
import { BotonGuardar, BotonSeguir } from "@/components/tienda/seguir";
import { EstadoPedido, Miniatura, type PedidoComprador, type TiendaFav } from "@/components/comprador/ui";

type Resumen = { nombre: string; pedidos: number; en_curso: number; pedidos_en_curso: PedidoComprador[]; por_valorar: number; tiendas_seguidas: TiendaFav[] };
type Prod = { id: string; nombre: string; precio_centimos: number; precio_final_centimos: number; descuento_pct: number; imagen_url: string };
type TiendaR = {
  id: string; nombre: string; slug: string; rubro: string; descripcion: string; lugar: string; logo_url: string;
  reputacion: string; ventas: number; valoracion: number | null; valoraciones: number; entregas: string[]; productos: Prod[];
};
type Busqueda = { tiendas: TiendaR[] };

// Rubros con la foto del prototipo (#/inicio, sección "Encuentra tu estilo"). Las fotos están en /public/inicio.
const RUBROS_FOTO: [string, string, string][] = [
  ["moda", "Moda", "casaca"],
  ["belleza", "Belleza", "crema"],
  ["hogar", "Hogar", "vela"],
  ["tecnologia", "Tecnología", "smartwatch"],
  ["comida", "Alimentos", "pancakes"],
  ["artesania", "Artesanías", "aretes"],
  ["deportes", "Deportes", "zapatillas"],
];
const ENTREGA: Record<string, { icono: typeof Store; t: string }> = {
  recojo: { icono: Store, t: "Recojo en tienda" },
  agencia: { icono: Package, t: "Envío por agencia" },
  motorizado: { icono: Bike, t: "Delivery con motorizado" },
};
const REPUTACION: Record<string, string> = { nueva: "Tienda nueva", buena: "Buena reputación", excelente: "Excelente reputación" };

// Encabezado de sección del prototipo (.hm-head): antetítulo coral, título con una palabra en itálica y enlace.
function Encabezado({ ante, titulo, italica, enlace, texto }: { ante: string; titulo: string; italica: string; enlace: string; texto: string }) {
  return (
    <div className="mb-[18px] flex items-end justify-between gap-4">
      <div>
        <small className="block text-[11.5px] font-extrabold uppercase tracking-[0.14em] text-coral">{ante}</small>
        <h2 className="mt-1.5 font-display text-[26px] font-extrabold tracking-[-0.04em] text-tinta md:text-[34px]">
          {titulo} <i className="font-serif font-semibold tracking-[-0.02em]">{italica}</i>
        </h2>
      </div>
      <Link href={enlace} className="whitespace-nowrap text-sm font-extrabold text-pino hover:underline">{texto} ↗</Link>
    </div>
  );
}

function Calificacion({ t }: { t: TiendaR }) {
  if (t.valoracion != null && t.valoraciones > 0)
    return (
      <span className="inline-flex items-center gap-1">
        <Star className="size-3.5 fill-tinta text-tinta" /> <b className="text-tinta">{t.valoracion.toFixed(1)}</b> <span>({t.valoraciones})</span>
      </span>
    );
  return <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-aviso text-aviso" /> {REPUTACION[t.reputacion] ?? "Tienda nueva"}</span>;
}

// Tarjeta de tienda del prototipo (VG.storeCard).
function TarjetaTienda({ t }: { t: TiendaR }) {
  return (
    <article className="flex flex-col gap-3 rounded-[22px] border border-linea bg-white p-[18px] transition hover:shadow-suave">
      <header className="flex items-center gap-3.5">
        {t.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.logo_url} alt="" className="size-[60px] shrink-0 rounded-[20px] object-cover" />
        ) : (
          <span className="grid size-[60px] shrink-0 place-items-center rounded-[20px] bg-pino-claro font-display text-[28px] font-extrabold text-pino">{t.nombre[0].toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <Link href={`/t/${t.slug}`} className="block truncate font-display text-[19px] font-extrabold tracking-[-0.02em] text-tinta hover:underline">{t.nombre}</Link>
          <span className="block truncate text-[14px] text-gris">{rubros[t.rubro] ?? t.rubro}</span>
        </div>
        <BotonSeguir tiendaId={t.id} clase="grid size-11 shrink-0 place-items-center rounded-full border border-linea bg-white text-gris transition hover:scale-105 hover:text-coral" />
      </header>
      {t.descripcion && <p className="line-clamp-2 text-[14.5px] text-gris">{t.descripcion}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-gris">
        <Calificacion t={t} />
        {t.lugar && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {t.lugar.split(",")[0]}</span>}
        <span className="inline-flex items-center gap-1"><ShoppingBag className="size-3.5" /> {t.ventas.toLocaleString("es-PE")} {t.ventas === 1 ? "venta" : "ventas"}</span>
      </div>
      {t.productos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {t.productos.slice(0, 3).map((p) => (
            <Link key={p.id} href={`/t/${t.slug}/p/${p.id}`} className="casilla-producto relative block aspect-square overflow-hidden rounded-xl" title={p.nombre}>
              {p.imagen_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imagen_url} alt={p.nombre} className="foto-producto" />
              ) : (
                <span className="block aspect-square" />
              )}
              {p.descuento_pct > 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-coral px-1.5 py-px text-[11px] font-bold text-white">-{p.descuento_pct}%</span>}
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/95 px-1.5 py-px text-[11.5px] font-bold text-tinta">{soles(p.precio_final_centimos).replace(".00", "")}</span>
            </Link>
          ))}
        </div>
      )}
      <footer className="mt-auto flex items-center gap-2 pt-1">
        <span className="flex gap-2.5 text-gris">
          {t.entregas.map((e) => {
            const E = ENTREGA[e];
            return E ? <span key={e} title={E.t}><E.icono className="size-[18px]" /></span> : null;
          })}
        </span>
        <Link href={`/t/${t.slug}`} className="ml-auto inline-flex h-11 items-center rounded-full bg-pino px-5 text-[14px] font-bold text-white transition hover:bg-pino-2">Ver tienda</Link>
      </footer>
    </article>
  );
}

// Tarjeta de producto del prototipo (VG.productCard).
function TarjetaProducto({ p, slug, tienda }: { p: Prod; slug: string; tienda: string }) {
  const rebaja = p.precio_final_centimos < p.precio_centimos;
  return (
    <Link href={`/t/${slug}/p/${p.id}`} className="group flex flex-col rounded-[22px] border border-linea bg-white p-3 transition hover:shadow-suave">
      <span className="casilla-producto relative block aspect-square overflow-hidden rounded-[16px]">
        {p.imagen_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imagen_url} alt={p.nombre} className="foto-producto" />
        ) : (
          <span className="block aspect-square" />
        )}
        {rebaja && <span className="absolute left-2.5 top-2.5 rounded-lg bg-coral px-2 py-0.5 text-[12px] font-bold text-white">-{p.descuento_pct}%</span>}
        <span className="absolute right-2.5 top-2.5">
          <BotonGuardar productoId={p.id} clase="grid size-9 place-items-center rounded-full bg-white/95 text-gris transition hover:scale-105 hover:text-coral" />
        </span>
      </span>
      <span className="mt-3 block truncate px-1 text-[13px] text-gris">{tienda}</span>
      <b className="block truncate px-1 text-[15px] text-tinta">{p.nombre}</b>
      <span className="mt-auto flex items-baseline gap-2 px-1 pt-2">
        <b className="font-display text-[20px] text-tinta">{soles(p.precio_final_centimos)}</b>
        {rebaja && <s className="text-[13px] text-gris">{soles(p.precio_centimos)}</s>}
      </span>
    </Link>
  );
}

// Mi inicio del comprador: el inicio del marketplace del prototipo (#/inicio y #/mi-inicio) con datos reales.
export default function MiInicio() {
  const router = useRouter();
  const { datos } = useApi<Resumen>("/comprador/resumen");
  const yo = useApi<{ rol: string }>("/me");
  const seguidasIds = (datos?.tiendas_seguidas ?? []).map((t) => t.id).join(",");
  const deSeguidas = useApi<Busqueda>(seguidasIds ? `/buscar?ids=${seguidasIds}&impulsos=0` : null);
  const top = useApi<Busqueda>("/buscar?orden=ventas&impulsos=0");
  if (!datos) return <Cargando />;

  const nombre = datos.nombre.split(" ")[0];
  const siguiendo = deSeguidas.datos?.tiendas ?? [];
  const idsSeguidas = new Set(datos.tiendas_seguidas.map((t) => t.id));
  const tiendas = top.datos?.tiendas ?? [];
  // La tienda de la tarjetita del banner: la que más vende (como "Luna & Sol" en el prototipo).
  const estrella = tiendas[0];
  // "Lo que está destacando": hasta 4 productos con foto, uno por tienda.
  const destacando: { p: Prod; t: TiendaR }[] = [];
  for (const t of tiendas) {
    const p = t.productos.find((x) => x.imagen_url);
    if (p && destacando.length < 4) destacando.push({ p, t });
  }
  const descubrir = tiendas.filter((t) => !idsSeguidas.has(t.id)).slice(0, 6);
  const pedido = datos.pedidos_en_curso[0];

  function buscar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q")?.toString().trim();
    router.push(q ? `/buscar?q=${encodeURIComponent(q)}` : "/buscar");
  }

  return (
    <div>
      {/* Banner del prototipo (.hm-hero) */}
      <section className="relative grid items-center gap-8 overflow-hidden rounded-[28px] bg-pino px-5 py-6 text-white md:px-11 md:py-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <span className="pointer-events-none absolute -right-[170px] -top-[260px] size-[520px] rounded-full border border-white/[0.12] shadow-[0_0_0_60px_rgba(255,255,255,0.03),0_0_0_120px_rgba(255,255,255,0.02)]" />
        <div className="relative">
          <span className="inline-block rounded-full bg-coral px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em]">Hola, {nombre}</span>
          <h1 className="mb-3 mt-[18px] font-display text-[30px] font-extrabold leading-[1.02] tracking-[-0.045em] md:text-[clamp(34px,3.8vw,54px)]">
            Tu próxima tienda favorita está <strong className="text-coral">más cerca.</strong>
          </h1>
          <p className="max-w-[480px] leading-[1.65] text-[#dfe9e3]">Descubre marcas, encuentra productos y compra directamente a tiendas que tienen algo especial.</p>
          <form onSubmit={buscar} role="search" className="mt-[22px] flex max-w-[520px] items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.2)]">
            <Search className="size-[18px] shrink-0 text-gris" />
            <input name="q" aria-label="Buscar" placeholder="¿Qué estás buscando?" className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[15px] text-tinta outline-none placeholder:text-gris" />
            <button aria-label="Buscar" className="grid size-11 shrink-0 place-items-center rounded-full bg-coral text-lg font-extrabold text-white transition hover:brightness-95">↗</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-x-[18px] gap-y-2 text-[13px] font-bold">
            <span>✓ Tiendas verificadas</span>
            <span>✓ Pagas directo a la tienda</span>
            <span className="hidden sm:inline">✓ Envíos a todo el Perú</span>
          </div>
        </div>
        <div className="relative h-[200px] overflow-hidden rounded-[22px] md:h-[240px] lg:h-[320px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/inicio/compras.jpg" alt="" className="size-full object-cover" />
          {estrella && (
            <Link href={`/t/${estrella.slug}`} className="absolute bottom-4 left-4 flex items-center gap-2.5 rounded-2xl bg-white py-2.5 pl-2.5 pr-3.5 text-tinta shadow-[0_16px_34px_-14px_rgba(0,0,0,0.45)]">
              <span className="size-[38px] shrink-0 overflow-hidden rounded-full">
                {estrella.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={estrella.logo_url} alt="" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center bg-pino-claro font-display font-extrabold text-pino">{estrella.nombre[0].toUpperCase()}</span>
                )}
              </span>
              <span>
                <b className="flex items-center gap-1 text-[13.5px]">{estrella.nombre} <BadgeCheck className="size-3.5 text-pino" /></b>
                <small className="text-[12px] text-gris">
                  {estrella.valoracion != null && estrella.valoraciones > 0 ? `★ ${estrella.valoracion.toFixed(1)} · ` : ""}
                  {rubros[estrella.rubro] ?? estrella.rubro}
                </small>
              </span>
            </Link>
          )}
        </div>
      </section>

      {/* Pedido en curso (.hm-order) */}
      {pedido && (
        <Link href={`/seguimiento/${pedido.token}`} className="mt-4 flex flex-wrap items-center gap-3.5 rounded-[18px] border border-linea bg-white px-4 py-3">
          <Miniatura p={pedido} className="size-[52px] shrink-0" />
          <div className="min-w-0 flex-1">
            <small className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-coral">Tu pedido en curso</small>
            <b className="block truncate font-display font-extrabold text-tinta">{pedido.producto || pedido.codigo}</b>
            <span className="text-[13px] text-gris">{pedido.tienda}</span>
          </div>
          <EstadoPedido p={pedido} />
          <span className="whitespace-nowrap font-extrabold text-pino">Ver ↗</span>
        </Link>
      )}

      {/* Encuentra tu estilo (.hm-cats) */}
      <section className="mt-11">
        <Encabezado ante="Explora" titulo="Encuentra tu" italica="estilo" enlace="/buscar" texto="Ver todas" />
        <div className="flex gap-2.5 overflow-x-auto [scrollbar-width:none] md:grid md:grid-cols-7 md:gap-3.5 md:overflow-visible">
          {RUBROS_FOTO.map(([k, t, foto]) => (
            <Link key={k} href={`/buscar?rubro=${k}`} className="group flex w-[78px] shrink-0 flex-col items-center gap-2.5 text-[12.5px] font-bold text-tinta md:w-auto md:text-[14px]">
              <span className="block aspect-square w-full overflow-hidden rounded-[22px] bg-white shadow-[0_10px_24px_-18px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:-translate-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/inicio/${foto}.jpg`} alt="" className="size-full object-cover" />
              </span>
              {t}
            </Link>
          ))}
        </div>
      </section>

      {siguiendo.length > 0 && (
        <section className="mt-11">
          <Encabezado ante="Tus favoritas" titulo="Tiendas que" italica="sigues" enlace="/mi-cuenta/favoritos" texto="Ver favoritos" />
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">{siguiendo.slice(0, 3).map((t) => <TarjetaTienda key={t.id} t={t} />)}</div>
        </section>
      )}

      {destacando.length > 0 && (
        <section className="mt-11">
          <Encabezado ante="Selección VendiGo" titulo="Lo que está" italica="destacando" enlace="/buscar" texto="Ver más" />
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">{destacando.map(({ p, t }) => <TarjetaProducto key={p.id} p={p} slug={t.slug} tienda={t.nombre} />)}</div>
        </section>
      )}

      {descubrir.length > 0 && (
        <section className="mt-11">
          <Encabezado ante="Tiendas" titulo="Tiendas para" italica="descubrir" enlace="/buscar" texto="Ver todas" />
          <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">{descubrir.map((t) => <TarjetaTienda key={t.id} t={t} />)}</div>
        </section>
      )}

      {/* Invitación a vender (.hm-promo) */}
      {yo.datos?.rol !== "vendedor" && (
        <section className="relative mt-11 flex flex-col items-start justify-between gap-6 overflow-hidden rounded-[26px] bg-pino px-5 py-6 text-white md:flex-row md:items-center md:px-9 md:py-8">
          <span className="pointer-events-none absolute -right-[100px] -top-[140px] size-[300px] rounded-full bg-[radial-gradient(circle,rgba(243,107,80,0.4),transparent_70%)]" />
          <div className="relative">
            <small className="block text-[11.5px] font-extrabold uppercase tracking-[0.14em] text-coral">Para emprendedores</small>
            <h3 className="mb-2 mt-1.5 font-display text-[22px] font-extrabold tracking-[-0.04em] md:text-[28px]">
              Tu marca merece llegar <i className="font-serif font-semibold tracking-[-0.02em]">más lejos.</i>
            </h3>
            <p className="max-w-[560px] text-[#dfe9e3]">Abre tu tienda gratis: tus clientes te piden ordenado, te pagan directo y siguen su pedido.</p>
          </div>
          <Link href="/vendedor/crear-tienda" className="relative inline-flex h-12 w-full items-center justify-center rounded-full bg-coral px-7 font-bold text-white transition hover:brightness-95 md:w-auto">Crear mi tienda ↗</Link>
        </section>
      )}
    </div>
  );
}
