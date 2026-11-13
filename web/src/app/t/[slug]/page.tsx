import { estiloTema } from "@/lib/tema";
import { PieLegal } from "@/components/legal/pie";
import type { Metadata } from "next";
import { ContarVisita } from "@/components/tienda/contar-visita";
import { notFound } from "next/navigation";
import { BadgeCheck, Bike, Clock, Flame, MapPin, Megaphone, MessageCircle, Package, RefreshCw, ShieldCheck, Sparkles, Star, Store, Tag, Wallet } from "lucide-react";
import { API_URL, cabeceraSesion } from "@/lib/servidor/sesion";
import { soles } from "@/lib/formato";
import { rubros } from "@/lib/catalogos";
import type { Producto, Tienda } from "@/lib/tipos";
import { CabeceraTienda } from "@/components/tienda/cabecera-tienda";
import { Portada } from "@/components/tienda/portada";
import { SeguirTienda } from "@/components/tienda/acciones-tienda";
import { iniciales } from "@/components/comprador/ui";
import { Catalogo } from "@/components/tienda/catalogo";
import { Destacado } from "@/components/tienda/destacado";
import { BotonCompartir } from "@/components/tienda/compartir";
import { IconoFacebook, IconoInstagram, IconoTiktok } from "@/components/tienda/iconos-redes";
import { enlaceRed } from "@/lib/redes";

// Página pública de la tienda. Se genera en el servidor para que Google pueda leerla.
async function cargar(slug: string) {
  const headers = await cabeceraSesion();
  const [t, p] = await Promise.all([
    fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}`, { cache: "no-store", headers }),
    fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}/productos`, { cache: "no-store", headers }),
  ]);
  if (!t.ok) return null;
  return { tienda: (await t.json()) as Tienda, productos: ((await p.json()) as { productos: Producto[] }).productos };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await cargar((await params).slug).catch(() => null);
  if (!d) return { title: "Tienda no encontrada" };
  return {
    title: d.tienda.nombre,
    description: d.tienda.descripcion || `${rubros[d.tienda.rubro]} en ${d.tienda.ciudad}. Pide con seguimiento en VendiGo.`,
    openGraph: { images: d.tienda.logo_url ? [d.tienda.logo_url] : [] },
  };
}

const reputaciones = {
  nueva: "Tienda nueva",
  buena: "Buena reputación",
  excelente: "Excelente reputación",
};

const redondo =
  "grid size-11 place-items-center rounded-full bg-white text-tinta ring-1 ring-linea transition hover:bg-arena/60";

const PAGOS: Record<string, string> = { yape_directo: "Yape", plin_directo: "Plin", tarjeta_tienda: "Tarjeta", transferencia_tienda: "Transferencia" };

type Busqueda = { vista?: string; q?: string; f?: string };

export default async function TiendaPublica({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Busqueda> }) {
  const sp = await searchParams;
  const vista = sp.vista === "1";
  const q = (sp.q ?? "").trim().slice(0, 80);
  const filtroInicial = sp.f === "nuevo" || sp.f === "vendidos" ? sp.f : "todos";
  const d = await cargar((await params).slug).catch(() => null);
  if (!d) notFound();
  const { tienda: t, productos } = d;

  const ventas = productos.reduce((s, p) => s + (p.vendidos || 0), 0);
  const nuevo = [...productos].sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
  const masVendido = [...productos].filter((p) => p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos)[0];
  const elegido = t.destacado_id ? productos.find((p) => p.id === t.destacado_id) : undefined;
  const destacado = elegido ?? masVendido ?? nuevo;
  const lugar = t.distrito || t.ciudad;
  const seguidores = t.seguidores ?? 0;
  const opiniones = t.opiniones ?? [];
  const conValoracion = t.valoracion != null && (t.valoraciones ?? 0) > 0;
  const pagos = (t.metodos_pago ?? []).map((k) => PAGOS[k] ?? k);
  const redes = [
    { nombre: "Instagram", href: enlaceRed("instagram", t.instagram), icono: <IconoInstagram className="size-[18px]" /> },
    { nombre: "TikTok", href: enlaceRed("tiktok", t.tiktok), icono: <IconoTiktok className="size-[18px]" /> },
    { nombre: "Facebook", href: enlaceRed("facebook", t.facebook), icono: <IconoFacebook className="size-[19px]" /> },
  ].filter((r) => r.href);

  // Franja de cómo llega y cómo se paga (lo primero que se pregunta antes de comprar).
  const franja = [
    t.entrega.agencia && { icono: <Package className="size-4" />, texto: t.entrega.costo_agencia_centimos ? `Agencia desde ${soles(t.entrega.costo_agencia_centimos)}` : "Envío por agencia" },
    t.entrega.recojo && { icono: <Store className="size-4" />, texto: `Recojo en ${lugar}` },
    t.entrega.motorizado && { icono: <Bike className="size-4" />, texto: t.entrega.zonas_motorizado ? `Delivery: ${t.entrega.zonas_motorizado}` : "Delivery con motorizado" },
    pagos.length > 0 && { icono: <Wallet className="size-4" />, texto: pagos.join(", ") },
  ].filter(Boolean) as { icono: React.ReactNode; texto: string }[];

  // Accesos rápidos, con la foto del producto que corresponde cuando hay una.
  const enlaceVista = vista ? "&vista=1" : "";
  const accesos = [
    { texto: "Lo nuevo", href: `?f=nuevo${enlaceVista}#productos`, foto: nuevo?.imagenes[0]?.url, icono: <Sparkles className="size-5" /> },
    { texto: "Más vendidos", href: `?f=vendidos${enlaceVista}#productos`, foto: masVendido?.imagenes[0]?.url, icono: <Flame className="size-5" /> },
    { texto: "Envíos y pagos", href: "#envios", icono: <Package className="size-5" /> },
    { texto: "Opiniones", href: "#opiniones", icono: <MessageCircle className="size-5" /> },
  ];

  return (
    <div className="min-h-screen bg-crema">
      {!vista && <><CabeceraTienda tienda={t} q={q} /><ContarVisita slug={t.slug} /></>}

      <main className="w-full px-4 pb-16 sm:px-6 lg:px-10" style={estiloTema(t)}>
        {t.pausada && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-arena px-5 py-3 text-sm text-tinta ring-1 ring-linea">
            <Clock className="size-5 shrink-0" />
            <span><b>Tienda en pausa.</b> Por ahora no está recibiendo pedidos. Puedes ver sus productos y volver pronto.</span>
          </div>
        )}
        {t.aviso && !t.pausada && (
          <div className="mt-5 flex items-center gap-2 rounded-2xl bg-pino px-5 py-3 text-sm font-semibold text-white">
            <Megaphone className="size-4 shrink-0 text-coral" /> {t.aviso}
          </div>
        )}
        {!t.identidad_verificada && (
          <p className="mt-5 rounded-2xl bg-aviso-claro px-5 py-3 text-sm font-semibold text-aviso">
            Vista previa: tu tienda todavía no se muestra a los compradores hasta que VendiGo verifique tu identidad.
          </p>
        )}

        {!q && (
          <>
            <div className="mt-6">
              <Portada url={t.portada_url} nombre={t.nombre} />
            </div>

            {/* Identidad: logo, nombre, insignias, datos de confianza y acciones. Alineado a la izquierda. */}
            <section className="relative px-1 sm:px-8">
              <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
                <div className="size-24 shrink-0 overflow-hidden rounded-full bg-white ring-4 ring-crema sm:size-28">
                  {t.logo_url ? (
                    <img src={t.logo_url} alt={`Logo de ${t.nombre}`} className="size-full object-cover" />
                  ) : (
                    <span className="grid size-full place-items-center bg-pino-claro font-display text-3xl font-extrabold text-pino">{iniciales(t.nombre)}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!vista && <SeguirTienda tiendaId={t.id} />}
                  <BotonCompartir nombre={t.nombre} clase={redondo} />
                  {redes.map((r) => (
                    <a key={r.nombre} href={r.href} target="_blank" rel="noopener noreferrer" className={redondo} aria-label={r.nombre} title={r.nombre}>
                      {r.icono}
                    </a>
                  ))}
                  <a
                    href={`https://www.google.com/maps/search/${encodeURIComponent(`${t.entrega.direccion_recojo || lugar}, ${t.ciudad}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={redondo}
                    aria-label="Ver ubicación"
                    title="Ver ubicación"
                  >
                    <MapPin className="size-[18px]" />
                  </a>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <h1 className="text-3xl font-extrabold text-tinta sm:text-4xl">{t.nombre}</h1>
                {t.identidad_verificada && (
                  <span title="VendiGo verificó el documento de identidad de la dueña de esta tienda." className="text-pino">
                    <ShieldCheck className="size-6" aria-label="Identidad verificada" />
                  </span>
                )}
                {t.ruc_verificado && (
                  <span title="VendiGo verificó el RUC de este negocio con su ficha RUC." className="inline-flex items-center gap-1 rounded-md bg-[#e8eefb] px-2 py-1 text-xs font-bold text-[#1f3a7a]">
                    <BadgeCheck className="size-3.5" /> RUC verificado
                  </span>
                )}
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gris">
                <span className="inline-flex items-center gap-1.5"><Tag className="size-4" /> {rubros[t.rubro] ?? t.rubro}</span>
                <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" /> {lugar}{t.distrito && t.ciudad !== t.distrito ? `, ${t.ciudad}` : ""}</span>
              </p>

              <div className="mt-4 flex flex-wrap gap-x-7 gap-y-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <Star className="size-4 fill-aviso text-aviso" />
                  {conValoracion ? (
                    <span><b className="text-tinta">{t.valoracion!.toFixed(1)}</b> <a href="#opiniones" className="text-gris hover:underline">({t.valoraciones} {t.valoraciones === 1 ? "opinión" : "opiniones"})</a></span>
                  ) : (
                    <b className="text-tinta">{reputaciones[t.reputacion]}</b>
                  )}
                </div>
                <Dato n={ventas} uno="venta" varios="ventas" />
                <Dato n={seguidores} uno="seguidor" varios="seguidores" />
                <Dato n={productos.length} uno="producto" varios="productos" />
              </div>

              {t.descripcion && <p className="mt-4 max-w-2xl leading-relaxed text-tinta/85">{t.descripcion}</p>}
            </section>

            {franja.length > 0 && (
              <ul className="mt-7 grid overflow-hidden rounded-2xl bg-linea/70 ring-1 ring-linea/70" style={{ gap: 1, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                {franja.map((f) => (
                  <li key={f.texto} className="flex items-center gap-2.5 bg-white px-4 py-3 text-sm font-semibold text-tinta">
                    <span className="text-pino">{f.icono}</span> {f.texto}
                  </li>
                ))}
              </ul>
            )}

            <nav aria-label="Accesos rápidos" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {accesos.map((a) => (
                <a key={a.texto} href={a.href} className="flex items-center gap-3 rounded-2xl bg-white p-2.5 pr-4 ring-1 ring-linea/70 transition hover:ring-pino">
                  <span className="casilla-producto grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl text-pino">
                    {a.foto ? <img src={a.foto} alt="" className="foto-producto" /> : a.icono}
                  </span>
                  <span className="text-sm font-bold text-tinta">{a.texto}</span>
                </a>
              ))}
            </nav>

            {destacado && (
              <Destacado
                producto={destacado}
                slug={t.slug}
                vista={vista}
                etiqueta={elegido || masVendido ? "Destacado" : "Lo nuevo"}
                texto={elegido ? `Elegido por ${t.nombre}` : masVendido ? `El más pedido de ${t.nombre}` : `Lo último de ${t.nombre}`}
              />
            )}
          </>
        )}

        <Catalogo key={`${filtroInicial}-${q}`} productos={productos} slug={t.slug} vista={vista} q={q} filtroInicial={filtroInicial} />

        {!q && (
          <>
            {/* Conoce a la emprendedora (opcional) */}
            {t.historia && (
              <section className="mt-12 grid items-center gap-6 overflow-hidden rounded-[26px] bg-white p-6 ring-1 ring-linea/50 sm:grid-cols-[220px_1fr] sm:p-8">
                {t.historia_foto_url ? (
                  <img src={t.historia_foto_url} alt={`Quien está detrás de ${t.nombre}`} className="aspect-square w-full max-w-[220px] rounded-2xl object-cover" />
                ) : (
                  <span className="grid aspect-square w-full max-w-[220px] place-items-center rounded-2xl bg-pino-claro font-display text-6xl font-extrabold text-pino">{iniciales(t.nombre)}</span>
                )}
                <div>
                  <p className="text-sm font-bold text-coral">Conoce a la emprendedora</p>
                  <h2 className="mt-1 text-2xl font-extrabold text-tinta">La historia detrás de {t.nombre}</h2>
                  <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-tinta/85">{t.historia}</p>
                  {t.vende_desde && <p className="mt-4 text-sm font-semibold text-pino">Vendiendo desde {t.vende_desde}</p>}
                </div>
              </section>
            )}

            {/* Envíos y opiniones */}
            <div className="mt-12 grid gap-4 lg:grid-cols-2">
              <section id="envios" className="scroll-mt-28 rounded-[22px] bg-white p-6 ring-1 ring-linea/60">
                <h2 className="text-2xl font-extrabold text-tinta">Envíos y pagos</h2>
                <ul className="mt-4 space-y-4">
                  {t.entrega.recojo && (
                    <Opcion
                      icono={<Store className="size-4" />}
                      titulo="Recojo en tienda"
                      texto={[
                        t.entrega.direccion_recojo || "Coordina el recojo con la tienda",
                        diasTexto(t.entrega.dias_recojo),
                        t.entrega.adelanto_pct ? `Reservas con ${t.entrega.adelanto_pct}% de adelanto` : "",
                        t.entrega.instrucciones_recojo,
                      ].filter(Boolean).join(" · ")}
                    />
                  )}
                  {t.entrega.agencia && (
                    <Opcion
                      icono={<Package className="size-4" />}
                      titulo="Envío por agencia"
                      texto={`Pagas en la app y recibes tu código de recojo${t.entrega.agencias.length ? ` · ${t.entrega.agencias.join(", ")}` : ""}${t.entrega.costo_agencia_centimos ? ` · desde ${soles(t.entrega.costo_agencia_centimos)}` : ""}`}
                    />
                  )}
                  {t.entrega.motorizado && (
                    <Opcion
                      icono={<Bike className="size-4" />}
                      titulo="Delivery con motorizado"
                      texto={`${t.entrega.zonas_motorizado || "Zonas cercanas"}${t.entrega.costo_motorizado_centimos ? ` · ${soles(t.entrega.costo_motorizado_centimos)}` : ""}`}
                    />
                  )}
                  {t.entrega.otra && (
                    <Opcion icono={<MapPin className="size-4" />} titulo="Otra modalidad" texto={t.entrega.descripcion_otra || "Coordina con la tienda"} />
                  )}
                </ul>
                <div className="mt-5 flex flex-wrap gap-2">
                  {pagos.map((m) => (
                    <span key={m} className="rounded-full bg-arena px-3 py-1.5 text-sm font-semibold text-tinta">{m}</span>
                  ))}
                </div>
                <p className="mt-4 flex items-center gap-2 text-sm text-gris">
                  <ShieldCheck className="size-4 shrink-0 text-pino" /> Le pagas directo a la tienda y sigues tu pedido en VendiGo. Si algo sale mal, VendiGo media.
                </p>
                {(t.horario || t.entrega.horario_recojo) && (
                  <p className="mt-2 flex items-center gap-2 text-sm text-gris">
                    <Clock className="size-4 shrink-0 text-pino" /> {t.horario || t.entrega.horario_recojo}
                  </p>
                )}
                {t.politicas && (
                  <p className="mt-2 flex items-start gap-2 text-sm text-gris">
                    <RefreshCw className="mt-0.5 size-4 shrink-0 text-pino" /> {t.politicas}
                  </p>
                )}
              </section>

              <section id="opiniones" className="scroll-mt-28 rounded-[22px] bg-white p-6 ring-1 ring-linea/60">
                <div className="flex items-baseline justify-between gap-3 border-b border-linea pb-3">
                  <h2 className="text-2xl font-extrabold text-tinta">Opiniones</h2>
                  {conValoracion && (
                    <span className="inline-flex items-center gap-1 text-sm text-gris">
                      <Star className="size-4 fill-aviso text-aviso" /> <b className="text-tinta">{t.valoracion!.toFixed(1)}</b> de {t.valoraciones} {t.valoraciones === 1 ? "compra" : "compras"}
                    </span>
                  )}
                </div>
                {opiniones.length ? (
                  <ul className="divide-y divide-linea">
                    {opiniones.map((o, i) => (
                      <li key={i} className="py-4">
                        <div className="flex items-center justify-between gap-3">
                          <b className="text-sm text-tinta">{o.autor || "Cliente"}</b>
                          <span className="flex" aria-label={`${o.estrellas} de 5 estrellas`}>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} className={`size-3.5 ${n <= o.estrellas ? "fill-aviso text-aviso" : "text-linea"}`} />
                            ))}
                          </span>
                        </div>
                        {(o.etiquetas ?? []).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {o.etiquetas!.map((e) => <span key={e} className="rounded-full bg-arena px-2.5 py-1 text-xs font-semibold text-tinta">{e}</span>)}
                          </div>
                        )}
                        {o.comentario && <p className="mt-1.5 text-sm leading-relaxed text-tinta/85">{o.comentario}</p>}
                        <p className="mt-1 text-xs text-gris">Compra entregada · {fecha(o.creado_en)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="grid place-items-center py-10 text-center">
                    <span className="grid size-14 place-items-center rounded-full bg-arena text-pino">
                      <MessageCircle className="size-6" />
                    </span>
                    <p className="mt-3 font-bold text-tinta">Aún no hay opiniones</p>
                    <p className="mt-1 max-w-xs text-sm text-gris">Aparecen cuando los clientes reciben su pedido y lo califican.</p>
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        {/* Pie */}
        <footer className="mt-14 text-center">
          <p className="font-display text-lg font-extrabold text-tinta">{t.nombre}</p>
          <p className="mt-1 text-sm text-gris">Tienda en VendiGo · {t.enlace.replace(/^https?:\/\//, "")}</p>
          <PieLegal className="mt-5" />
        </footer>
      </main>
    </div>
  );
}

function Dato({ n, uno, varios }: { n: number; uno: string; varios: string }) {
  return (
    <span>
      <b className="text-tinta">{n}</b> <span className="text-gris">{n === 1 ? uno : varios}</span>
    </span>
  );
}

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });
}

function Opcion({ icono, titulo, texto }: { icono: React.ReactNode; titulo: string; texto: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-arena text-pino">{icono}</span>
      <div>
        <p className="font-bold text-tinta">{titulo}</p>
        <p className="text-sm text-gris">{texto}</p>
      </div>
    </li>
  );
}

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function diasTexto(d?: number[]) {
  if (!d || d.length === 0 || d.length === 7) return d?.length === 7 ? "Todos los días" : "";
  return "Atiende " + [...d].sort().map((i) => DIAS_CORTOS[i]).join(", ");
}
