"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Bike, ChevronDown, ChevronUp, FileCheck2, Heart, MapPin, Package, ShoppingBag, Star, Store } from "lucide-react";
import { useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { rubros } from "@/lib/catalogos";
import { Cargando, cn } from "@/components/ui";
import { BotonGuardar, BotonSeguir } from "@/components/tienda/seguir";
import { CarruselInicio } from "@/components/comprador/carrusel";
import { EstadoPedido, Miniatura, type PedidoComprador, type TiendaFav } from "@/components/comprador/ui";

type Resumen = {
  nombre: string; pedidos: number; en_curso: number; pedidos_en_curso: PedidoComprador[];
  por_valorar: number; pedidos_por_valorar: PedidoComprador[]; tiendas_seguidas: TiendaFav[];
};
type Prod = { id: string; nombre: string; precio_centimos: number; precio_final_centimos: number; descuento_pct: number; imagen_url: string };
type TiendaR = {
  id: string; nombre: string; slug: string; rubro: string; descripcion: string; lugar: string; logo_url: string; reputacion: string;
  ventas: number; valoracion: number | null; valoraciones: number; ruc_verificado: boolean; entregas: string[]; productos: Prod[];
};
type Busqueda = { tiendas: TiendaR[] };
type Oferta = Prod & { tienda: string; tienda_slug: string; termina_en: string };
type Vendido = Prod & { tienda: string; tienda_slug: string; vendidos: number; valoracion: number | null; valoraciones: number; impulsado: boolean };

// Rubros con las fotos del prototipo ("Encuentra tu estilo"), en /public/inicio.
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
const CLAVE_OCULTO = "vg:inicio-lo-tuyo-oculto";

// "en 14 h", "en 1 día", "en 3 días" (cuánto le queda a la oferta).
function termina(iso: string) {
  const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000));
  if (h < 1) return "en menos de 1 h";
  if (h < 24) return `en ${h} h`;
  const d = Math.round(h / 24);
  return `en ${d} ${d === 1 ? "día" : "días"}`;
}

// Encabezado de sección del prototipo: antetítulo coral, título con una palabra en itálica y enlace.
function Encabezado({ ante, titulo, italica, enlace, texto, extra }: { ante: string; titulo: string; italica: string; enlace: string; texto: string; extra?: React.ReactNode }) {
  return (
    <div className="mb-[18px] flex items-end justify-between gap-4">
      <div>
        <small className="block text-[11.5px] font-extrabold uppercase tracking-[0.14em] text-coral">{ante}</small>
        <h2 className="mt-1.5 flex flex-wrap items-center gap-x-3 font-display text-[26px] font-extrabold tracking-[-0.04em] text-tinta md:text-[34px]">
          <span>{titulo} <i className="font-serif font-semibold tracking-[-0.02em]">{italica}</i></span>
          {extra}
        </h2>
      </div>
      <Link href={enlace} className="whitespace-nowrap text-sm font-extrabold text-pino hover:underline">{texto} ↗</Link>
    </div>
  );
}

// Tarjeta de tienda del prototipo, con las insignias: ✓ identidad verificada (todas) y RUC (si lo tiene).
function TarjetaTienda({ t, nueva }: { t: TiendaR; nueva?: boolean }) {
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
          <Link href={`/t/${t.slug}`} className="flex items-center gap-1.5 font-display text-[19px] font-extrabold tracking-[-0.02em] text-tinta hover:underline">
            <span className="truncate">{t.nombre}</span>
            <span title="Identidad verificada" className="shrink-0"><BadgeCheck className="size-[18px] text-pino" aria-label="Identidad verificada" /></span>
            {t.ruc_verificado && (
              <span title="Negocio con RUC verificado" className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-pino-claro px-2 py-0.5 font-sans text-[11px] font-extrabold tracking-normal text-pino">
                <FileCheck2 className="size-3" /> RUC
              </span>
            )}
          </Link>
          <span className="block truncate text-[14px] text-gris">{rubros[t.rubro] ?? t.rubro}</span>
        </div>
        <BotonSeguir tiendaId={t.id} clase="grid size-11 shrink-0 place-items-center rounded-full border border-linea bg-white text-gris transition hover:scale-105 hover:text-coral" />
      </header>
      {t.descripcion && <p className="line-clamp-2 text-[14.5px] text-gris">{t.descripcion}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-gris">
        {nueva ? (
          <span className="rounded-full bg-coral-claro px-2.5 font-bold text-coral">Nueva en VendiGo</span>
        ) : t.valoracion != null && t.valoraciones > 0 ? (
          <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-tinta text-tinta" /> <b className="text-tinta">{t.valoracion.toFixed(1)}</b> ({t.valoraciones})</span>
        ) : (
          <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-aviso text-aviso" /> {REPUTACION[t.reputacion] ?? "Tienda nueva"}</span>
        )}
        {t.lugar && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {t.lugar.split(",")[0]}</span>}
        <span className="inline-flex items-center gap-1"><ShoppingBag className="size-3.5" /> {t.ventas.toLocaleString("es-PE")} {t.ventas === 1 ? "venta" : "ventas"}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((k) => {
          const p = t.productos[k];
          return p ? (
            <Link key={p.id} href={`/t/${t.slug}/p/${p.id}`} className="casilla-producto relative block aspect-square overflow-hidden rounded-xl" title={p.nombre}>
              {p.imagen_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imagen_url} alt={p.nombre} className="foto-producto" />
              )}
              {p.descuento_pct > 0 && <span className="absolute left-1.5 top-1.5 rounded-md bg-coral px-1.5 py-px text-[11px] font-bold text-white">-{p.descuento_pct}%</span>}
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white/95 px-1.5 py-px text-[11.5px] font-bold text-tinta">{soles(p.precio_final_centimos).replace(".00", "")}</span>
            </Link>
          ) : (
            <span key={k} className="block aspect-square rounded-xl border border-dashed border-linea" aria-hidden="true" />
          );
        })}
      </div>
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

// Tarjeta de producto del prototipo. Los impulsados llevan su etiqueta (como "Patrocinado" en Marketplace).
function TarjetaProducto({ p }: { p: Vendido }) {
  const rebaja = p.precio_final_centimos < p.precio_centimos;
  return (
    <Link href={`/t/${p.tienda_slug}/p/${p.id}`} className="group flex flex-col rounded-[22px] border border-linea bg-white p-3 transition hover:shadow-suave">
      <span className="casilla-producto relative block aspect-square overflow-hidden rounded-[16px]">
        {p.imagen_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imagen_url} alt={p.nombre} className="foto-producto" />
        )}
        <span className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
          {p.impulsado && <span className="rounded-full bg-[#f6c453] px-2.5 py-0.5 text-[11.5px] font-extrabold text-tinta">Impulsado</span>}
          {rebaja && <span className="rounded-lg bg-coral px-2 py-0.5 text-[12px] font-bold text-white">-{p.descuento_pct}%</span>}
        </span>
        <span className="absolute right-2.5 top-2.5">
          <BotonGuardar productoId={p.id} clase="grid size-9 place-items-center rounded-full bg-white/95 text-gris transition hover:scale-105 hover:text-coral" />
        </span>
      </span>
      <span className="mt-3 block truncate px-1 text-[13px] text-gris">{p.tienda}</span>
      <b className="block truncate px-1 text-[15px] text-tinta">{p.nombre}</b>
      <span className="mt-auto flex items-center justify-between gap-2 px-1 pt-2">
        <span className="flex items-baseline gap-2">
          <b className={cn("font-display text-[20px]", rebaja ? "text-coral" : "text-tinta")}>{soles(p.precio_final_centimos)}</b>
          {rebaja && <s className="text-[13px] text-gris">{soles(p.precio_centimos)}</s>}
        </span>
        {p.valoraciones > 0 && p.valoracion != null ? (
          <span className="inline-flex items-center gap-1 text-[13px] text-gris"><Star className="size-3.5 fill-tinta text-tinta" /> {p.valoracion.toFixed(1)}</span>
        ) : p.vendidos > 0 ? (
          <span className="text-[12.5px] text-gris">{p.vendidos} vendidos</span>
        ) : null}
      </span>
    </Link>
  );
}

// Mi inicio del comprador, con la estructura del prototipo: banner, lo tuyo (pedido, valoraciones y tiendas
// que sigues, que se puede ocultar), rubros, tiendas destacadas, lo más vendido, tiendas nuevas e invitación a vender.
export default function MiInicio() {
  const { datos } = useApi<Resumen>("/comprador/resumen");
  const yo = useApi<{ rol: string }>("/me");
  const top = useApi<Busqueda>("/buscar?orden=ventas&impulsos=0");
  const nuevas = useApi<Busqueda>("/buscar?orden=nuevas&impulsos=0");
  const vendidos = useApi<{ productos: Vendido[] }>("/mas-vendidos");
  // Ofertas solo de las tiendas que sigue.
  const ofertasSeguidas = useApi<{ ofertas: Oferta[] }>("/comprador/ofertas");
  const [oculto, setOculto] = useState(false);
  useEffect(() => {
    try {
      setOculto(localStorage.getItem(CLAVE_OCULTO) === "1");
    } catch {
      /* sin almacenamiento: se muestra */
    }
  }, []);
  function alternar() {
    setOculto((o) => {
      try {
        localStorage.setItem(CLAVE_OCULTO, o ? "0" : "1");
      } catch {
        /* nada */
      }
      return !o;
    });
  }
  if (!datos) return <Cargando />;

  const destacadas = (top.datos?.tiendas ?? []).slice(0, 6);
  const ids = new Set(destacadas.map((t) => t.id));
  const otras = (nuevas.datos?.tiendas ?? []).filter((t) => !ids.has(t.id)).slice(0, 6);
  const recientes = otras.length > 3 ? otras.slice(0, otras.length - (otras.length % 3)) : otras;
  const ofertas = ofertasSeguidas.datos?.ofertas ?? [];
  const pedido = datos.pedidos_en_curso[0];
  const hayTuyo = !!pedido || datos.pedidos_por_valorar.length > 0 || datos.tiendas_seguidas.length > 0;

  return (
    <div>
      <CarruselInicio saludo={`Hola, ${datos.nombre.split(" ")[0]}`} />

      {/* Ofertas (si alguna tienda tiene precios rebajados) */}
      {ofertas.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 flex items-baseline gap-2.5 font-display text-[22px] font-extrabold text-tinta">Ofertas <small className="font-sans text-[14px] font-normal text-gris">De las tiendas que sigues, por tiempo limitado</small></h2>
          <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
            {ofertas.map((o) => (
              <div key={o.id} className="w-[230px] shrink-0 snap-start">
                <TarjetaProducto p={{ ...o, vendidos: 0, valoracion: null, valoraciones: 0, impulsado: false }} />
                <p className="mt-1.5 px-1 text-[12.5px] text-gris">Termina {termina(o.termina_en)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Lo tuyo: solo aparece si hay algo, y se puede ocultar para dar todo el espacio a lo principal */}
      {hayTuyo && (
        <section className="mt-6">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="font-display text-[17px] font-extrabold text-tinta">Lo tuyo</h2>
            <button onClick={alternar} className="inline-flex items-center gap-1 text-[13px] font-bold text-gris hover:text-tinta" aria-expanded={!oculto}>
              {oculto ? <>Mostrar <ChevronDown className="size-4" /></> : <>Ocultar <ChevronUp className="size-4" /></>}
            </button>
          </div>
          {!oculto && (
            <div className="grid gap-3 lg:grid-cols-3">
              {pedido && (
                <Link href={`/seguimiento/${pedido.token}`} className="flex items-center gap-3.5 rounded-[18px] border border-linea bg-white px-4 py-3 transition hover:shadow-suave">
                  <Miniatura p={pedido} className="size-[52px] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <small className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-coral">Tu pedido en curso</small>
                    <b className="block truncate font-display font-extrabold text-tinta">{pedido.producto || pedido.codigo}</b>
                    <span className="flex items-center gap-2 text-[13px] text-gris"><span className="truncate">{pedido.tienda}</span> <EstadoPedido p={pedido} /></span>
                  </div>
                  <span className="whitespace-nowrap text-sm font-extrabold text-pino">Ver ↗</span>
                </Link>
              )}
              {datos.pedidos_por_valorar.length > 0 && (
                <Link href={`/mi-cuenta/valorar/${datos.pedidos_por_valorar[0].codigo}`} className="flex items-center gap-3.5 rounded-[18px] border border-[#f6d7c9] bg-[#fdf0ea] px-4 py-3 transition hover:shadow-suave">
                  <Miniatura p={datos.pedidos_por_valorar[0]} className="size-[52px] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <small className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-coral">
                      {datos.por_valorar === 1 ? "1 pedido por valorar" : `${datos.por_valorar} pedidos por valorar`}
                    </small>
                    <b className="block truncate font-display font-extrabold text-tinta">{datos.pedidos_por_valorar[0].producto || datos.pedidos_por_valorar[0].codigo}</b>
                    <span className="block truncate text-[13px] text-gris">{datos.pedidos_por_valorar[0].tienda}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-extrabold text-coral"><Star className="size-4 fill-current" /> Valorar</span>
                </Link>
              )}
              {datos.tiendas_seguidas.length > 0 && (
                <Link href="/mi-cuenta/favoritos" className="flex items-center gap-3.5 rounded-[18px] border border-linea bg-white px-4 py-3 transition hover:shadow-suave">
                  <span className="flex shrink-0 -space-x-3">
                    {datos.tiendas_seguidas.slice(0, 4).map((t) =>
                      t.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={t.id} src={t.logo_url} alt="" className="size-11 rounded-full object-cover ring-2 ring-white" />
                      ) : (
                        <span key={t.id} className="grid size-11 place-items-center rounded-full bg-pino-claro font-display font-extrabold text-pino ring-2 ring-white">{t.nombre[0].toUpperCase()}</span>
                      ),
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <small className="flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-coral"><Heart className="size-3 fill-current" /> Tiendas que sigues</small>
                    <b className="block truncate font-display font-extrabold text-tinta">{datos.tiendas_seguidas.map((t) => t.nombre).join(", ")}</b>
                  </div>
                  <span className="whitespace-nowrap text-sm font-extrabold text-pino">Ver ↗</span>
                </Link>
              )}
            </div>
          )}
        </section>
      )}

      {/* Explora · Encuentra tu estilo */}
      <section className="mt-11">
        <Encabezado ante="Explora" titulo="Encuentra tu" italica="estilo" enlace="/buscar" texto="Ver todas" />
        <div className="flex gap-2.5 overflow-x-auto [scrollbar-width:none] md:grid md:grid-cols-7 md:gap-3.5 md:overflow-visible">
          {RUBROS_FOTO.map(([k, t, foto]) => (
            <Link key={k} href={`/buscar?rubro=${k}`} className="group flex w-[86px] shrink-0 flex-col items-center gap-2.5 text-[12.5px] font-bold text-tinta md:w-auto md:text-[14px]">
              <span className="block aspect-square w-full overflow-hidden rounded-[22px] bg-white shadow-[0_10px_24px_-18px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:-translate-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/inicio/${foto}.jpg`} alt="" className="size-full object-cover" />
              </span>
              {t}
            </Link>
          ))}
        </div>
      </section>

      {/* Tiendas destacadas (las que más venden) */}
      {destacadas.length > 0 && (
        <section className="mt-11">
          <Encabezado ante="Las que más venden" titulo="Tiendas" italica="destacadas" enlace="/buscar?orden=ventas" texto="Ver todas" />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{destacadas.map((t) => <TarjetaTienda key={t.id} t={t} />)}</div>
        </section>
      )}

      {/* Lo más vendido, con los impulsados intercalados */}
      {(vendidos.datos?.productos.length ?? 0) > 0 && (
        <section className="mt-11">
          <Encabezado ante="Selección VendiGo" titulo="Lo más" italica="vendido" enlace="/buscar" texto="Ver más" />
          <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">{vendidos.datos!.productos.slice(0, 8).map((p) => <TarjetaProducto key={p.id} p={p} />)}</div>
        </section>
      )}

      {/* Tiendas nuevas, al final */}
      {recientes.length > 0 && (
        <section className="mt-11">
          <Encabezado ante="Recién llegadas" titulo="Tiendas para" italica="descubrir" enlace="/buscar?orden=nuevas" texto="Ver todas" />
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{recientes.map((t) => <TarjetaTienda key={t.id} t={t} nueva />)}</div>
        </section>
      )}

      {/* Para emprendedores */}
      {yo.datos && yo.datos.rol !== "vendedor" && (
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
