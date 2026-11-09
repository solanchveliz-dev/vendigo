import type { Metadata } from "next";
import { ContarVisita } from "@/components/tienda/contar-visita";
import { notFound } from "next/navigation";
import { Bike, Clock, MapPin, MessageCircle, Package, RefreshCw, ShieldCheck, Star, Store } from "lucide-react";
import { API_URL } from "@/lib/servidor/sesion";
import { soles } from "@/lib/formato";
import { rubros } from "@/lib/catalogos";
import type { Producto, Tienda } from "@/lib/tipos";
import { CabeceraPublica } from "@/components/tienda/cabecera";
import { Catalogo } from "@/components/tienda/catalogo";
import { Destacado } from "@/components/tienda/destacado";
import { BotonCompartir } from "@/components/tienda/compartir";
import { BotonSeguir } from "@/components/tienda/seguir";
import { IconoFacebook, IconoInstagram, IconoTiktok } from "@/components/tienda/iconos-redes";
import { enlaceRed } from "@/lib/redes";

// Página pública de la tienda. Se genera en el servidor para que Google pueda leerla.
async function cargar(slug: string) {
  const [t, p] = await Promise.all([
    fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}`, { cache: "no-store" }),
    fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}/productos`, { cache: "no-store" }),
  ]);
  if (!t.ok) return null;
  return { tienda: (await t.json()) as Tienda, productos: ((await p.json()) as { productos: Producto[] }).productos };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await cargar((await params).slug).catch(() => null);
  if (!d) return { title: "Tienda no encontrada" };
  return {
    title: d.tienda.nombre,
    description: d.tienda.descripcion || `${rubros[d.tienda.rubro]} en ${d.tienda.ciudad}. Compra con pago protegido en VendiGo.`,
    openGraph: { images: d.tienda.logo_url ? [d.tienda.logo_url] : [] },
  };
}

const reputaciones = {
  nueva: "Tienda nueva",
  buena: "Buena reputación",
  excelente: "Excelente reputación",
};

const redondo =
  "grid size-12 place-items-center rounded-full bg-white text-tinta shadow-suave ring-1 ring-linea/60 transition hover:-translate-y-0.5";

export default async function TiendaPublica({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ vista?: string }> }) {
  const vista = (await searchParams).vista === "1";
  const d = await cargar((await params).slug).catch(() => null);
  if (!d) notFound();
  const { tienda: t, productos } = d;

  const ventas = productos.reduce((s, p) => s + (p.vendidos || 0), 0);
  const nuevo = [...productos].sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
  const masVendido = [...productos].filter((p) => p.vendidos > 0).sort((a, b) => b.vendidos - a.vendidos)[0];
  const destacado = masVendido ?? nuevo;
  const lugar = t.distrito || t.ciudad;
  const redes = [
    { nombre: "Instagram", href: enlaceRed("instagram", t.instagram), icono: <IconoInstagram className="size-[19px]" /> },
    { nombre: "TikTok", href: enlaceRed("tiktok", t.tiktok), icono: <IconoTiktok className="size-[19px]" /> },
    { nombre: "Facebook", href: enlaceRed("facebook", t.facebook), icono: <IconoFacebook className="size-5" /> },
  ].filter((r) => r.href);

  return (
    <div className="min-h-screen bg-crema">
      {!vista && <><CabeceraPublica /><ContarVisita slug={t.slug} /></>}

      <main className="mx-auto max-w-[1400px] px-5 pb-16 sm:px-10">
        {t.pausada && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-arena px-5 py-3 text-sm text-tinta ring-1 ring-linea">
            <Clock className="size-5 shrink-0" />
            <span><b>Tienda en pausa.</b> Por ahora no está recibiendo pedidos. Puedes ver sus productos y volver pronto.</span>
          </div>
        )}
        {/* Portada */}
        <div
          className="relative mt-7 h-56 overflow-hidden rounded-[28px] bg-pino bg-cover bg-center sm:h-80"
          style={t.portada_url ? { backgroundImage: `url(${t.portada_url})` } : undefined}
        >
          {!t.portada_url && <div className="absolute -right-16 -top-20 size-80 rounded-full bg-white/5" />}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-crema/80 to-transparent" />
        </div>

        {/* Logo, nombre y datos */}
        <div className="relative -mt-16 flex flex-col items-center text-center">
          <div className="size-32 overflow-hidden rounded-full bg-white shadow-suave ring-4 ring-crema">
            {t.logo_url ? (
              <img src={t.logo_url} alt={t.nombre} className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center font-display text-5xl font-extrabold text-pino">{t.nombre[0]}</span>
            )}
          </div>
          <h1 className="mt-4 text-4xl font-extrabold text-tinta">{t.nombre}</h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-gris">
            {rubros[t.rubro] ?? t.rubro} · {lugar}
          </p>
          {t.descripcion && <p className="mt-3 max-w-xl leading-relaxed text-tinta/80">{t.descripcion}</p>}
          <p className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm text-gris">
            <span className="inline-flex items-center gap-1">
              <Star className="size-4 fill-aviso text-aviso" /> <b className="text-tinta">{reputaciones[t.reputacion]}</b>
            </span>
            <span>
              <b className="text-tinta">{ventas}</b> {ventas === 1 ? "venta" : "ventas"}
            </span>
            <span>
              <b className="text-tinta">{productos.length}</b> productos
            </span>
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <BotonSeguir clase={`${redondo} !bg-coral !text-white !ring-coral`} />
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
            <BotonCompartir nombre={t.nombre} clase={redondo} />
          </div>
        </div>

        <div className="mx-auto max-w-[1296px]">
          {/* Destacado */}
          {destacado && (
            <Destacado
              producto={destacado}
              slug={t.slug}
              etiqueta={masVendido ? "Destacado" : "Lo nuevo"}
              texto={masVendido ? `El más pedido de ${t.nombre}` : `Lo último de ${t.nombre}`}
            />
          )}

          <Catalogo productos={productos} slug={t.slug} />

          {/* Envíos y opiniones */}
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            <section id="envios" className="scroll-mt-6 rounded-[22px] bg-white/70 p-6 ring-1 ring-linea/50">
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
                {["Yape", "Tarjeta", "PagoEfectivo"].map((m) => (
                  <span key={m} className="rounded-full bg-arena px-3 py-1.5 text-sm font-semibold text-tinta">
                    {m}
                  </span>
                ))}
              </div>
              <p className="mt-4 flex items-center gap-2 text-sm text-gris">
                <ShieldCheck className="size-4 shrink-0 text-pino" /> Pagas dentro de VendiGo y tu dinero queda protegido hasta que recibas tu pedido.
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

            <section id="opiniones" className="scroll-mt-6 rounded-[22px] bg-white/70 p-6 ring-1 ring-linea/50">
              <div className="flex items-center justify-between border-b border-linea pb-3">
                <h2 className="text-2xl font-extrabold text-tinta">Opiniones</h2>
                <span className="inline-flex items-center gap-1 text-sm text-gris">
                  <Star className="size-4 fill-aviso text-aviso" /> {reputaciones[t.reputacion]}
                </span>
              </div>
              <div className="grid place-items-center py-10 text-center">
                <span className="grid size-14 place-items-center rounded-full bg-arena text-pino">
                  <MessageCircle className="size-6" />
                </span>
                <p className="mt-3 font-bold text-tinta">Aún no hay opiniones</p>
                <p className="mt-1 max-w-xs text-sm text-gris">Aparecen cuando los clientes reciben su pedido y lo califican.</p>
              </div>
            </section>
          </div>

          {/* Pie */}
          <footer className="mt-14 text-center">
            <div className="flex items-center justify-center gap-4">
              <span className="h-px w-20 bg-linea" />
              <span className="font-display text-lg font-extrabold text-tinta">{t.nombre}</span>
              <span className="h-px w-20 bg-linea" />
            </div>
            <p className="mt-2 text-sm text-gris">Tienda en VendiGo · {t.enlace.replace(/^https?:\/\//, "")}</p>
          </footer>
        </div>
      </main>
    </div>
  );
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
