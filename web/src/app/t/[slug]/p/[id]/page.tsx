import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bike, Check, ChevronRight, CircleHelp, MessageCircle, Package, RefreshCw, ShieldCheck, Store } from "lucide-react";
import { API_URL } from "@/lib/servidor/sesion";
import { hace, soles } from "@/lib/formato";
import { rubros } from "@/lib/catalogos";
import type { Producto, Tienda } from "@/lib/tipos";
import { CabeceraPublica } from "@/components/tienda/cabecera";
import { CompraProducto, GaleriaProducto } from "@/components/tienda/compra-producto";
import { BotonPregunta } from "@/components/tienda/pregunta";

type Pregunta = { pregunta: string; respuesta: string | null; respondida_en: string | null; creado_en: string };

// Página pública de un producto. Se genera en el servidor para que Google pueda leerla.
async function cargar(slug: string, id: string) {
  const [t, p] = await Promise.all([
    fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}`, { cache: "no-store" }),
    fetch(`${API_URL}/api/v1/tiendas/${encodeURIComponent(slug)}/productos/${encodeURIComponent(id)}`, { cache: "no-store" }),
  ]);
  if (!t.ok || !p.ok) return null;
  const d = (await p.json()) as { producto: Producto; preguntas: Pregunta[] };
  return { tienda: (await t.json()) as Tienda, ...d };
}

type Params = { params: Promise<{ slug: string; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, id } = await params;
  const d = await cargar(slug, id).catch(() => null);
  if (!d) return { title: "Producto no encontrado" };
  return {
    title: `${d.producto.nombre} · ${d.tienda.nombre}`,
    description: d.producto.descripcion || `${d.producto.nombre} en ${d.tienda.nombre}. Compra con pago protegido en VendiGo.`,
    openGraph: { images: d.producto.imagenes[0] ? [d.producto.imagenes[0].url] : [] },
  };
}

export default async function ProductoPublico({ params, searchParams }: Params & { searchParams: Promise<{ vista?: string }> }) {
  const { slug, id } = await params;
  const vista = (await searchParams).vista === "1";
  const d = await cargar(slug, id).catch(() => null);
  if (!d) notFound();
  const { tienda: t, producto: p, preguntas } = d;
  const lugar = t.distrito || t.ciudad;

  const confianza = [
    { icono: <ShieldCheck className="size-5" />, titulo: "Pago protegido", texto: "Yape o tarjeta en la app" },
    { icono: <Check className="size-5" />, titulo: "Ves cada paso", texto: "Te avisamos cómo va tu pedido" },
    t.politicas
      ? { icono: <RefreshCw className="size-5" />, titulo: "Cambios", texto: t.politicas.length > 40 ? t.politicas.slice(0, 40) + "…" : t.politicas }
      : { icono: <MessageCircle className="size-5" />, titulo: "Te ayudamos", texto: "Si algo sale mal, VendiGo media" },
  ];

  const det = (p.detalles ?? {}) as { ficha?: [string, string][]; colores?: [string, string][] };
  const ficha = [
    ["Tienda", t.nombre],
    ["Rubro", rubros[t.rubro] ?? t.rubro],
    ["Envía desde", lugar],
    ["Categoría", p.categoria],
    ...(det.colores?.length ? [["Colores", det.colores.map(([n]) => n).join(", ")]] : []),
    ...(det.ficha ?? []),
    ["Cambios", t.politicas],
  ].filter(([, v]) => v);

  return (
    <div className="min-h-screen bg-crema">
      {!vista && <CabeceraPublica />}

      <main className="mx-auto max-w-[1400px] px-5 pb-16 sm:px-10">
        <nav className="flex items-center gap-1.5 py-6 text-sm text-gris">
          <Link href="/" className="shrink-0 hover:text-tinta">Inicio</Link>
          <ChevronRight className="size-3.5 shrink-0" />
          <Link href={`/t/${t.slug}`} className="shrink-0 hover:text-tinta">{t.nombre}</Link>
          <ChevronRight className="size-3.5 shrink-0" />
          <span className="truncate text-tinta">{p.nombre}</span>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <GaleriaProducto producto={p} />

          <div>
            <Link href={`/t/${t.slug}`} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-linea/60 transition hover:ring-pino/30">
              <span className="size-11 shrink-0 overflow-hidden rounded-full bg-crema">
                {t.logo_url ? (
                  <img src={t.logo_url} alt="" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center font-display font-extrabold text-pino">{t.nombre[0]}</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-bold text-tinta">
                  {t.nombre} <ShieldCheck className="size-3.5 text-pino" />
                </span>
                <span className="block text-sm text-gris">
                  {rubros[t.rubro] ?? t.rubro} · {lugar}
                </span>
              </span>
              <ChevronRight className="size-5 text-tinta" />
            </Link>

            <h1 className="mt-5 text-[40px] font-extrabold leading-tight text-tinta">{p.nombre}</h1>
            <p className="mt-2 text-sm text-gris">
              {p.vendidos > 0 ? `${p.vendidos} vendidos` : "Recién publicado"}
              {preguntas.length > 0 && (
                <>
                  {" · "}
                  <a href="#preguntas" className="text-tinta underline underline-offset-2">{preguntas.length} {preguntas.length === 1 ? "pregunta" : "preguntas"}</a>
                </>
              )}
            </p>

            <CompraProducto producto={p} />

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {confianza.map((c) => (
                <div key={c.titulo} className="rounded-2xl bg-white p-4 ring-1 ring-linea/60">
                  <span className="text-pino">{c.icono}</span>
                  <p className="mt-2 font-bold text-tinta">{c.titulo}</p>
                  <p className="text-sm text-gris">{c.texto}</p>
                </div>
              ))}
            </div>

            <section className="mt-5 rounded-2xl bg-white px-4 py-2 ring-1 ring-linea/60">
              <p className="border-b border-linea py-3 text-sm font-bold text-tinta">Entrega</p>
              {t.entrega.recojo && (
                <FilaEntrega icono={<Store className="size-5" />} titulo="Recojo en tienda" texto={`Eliges el día · ${t.entrega.direccion_recojo || lugar}`} precio="Gratis" />
              )}
              {t.entrega.agencia && (
                <FilaEntrega
                  icono={<Package className="size-5" />}
                  titulo="Envío por agencia"
                  texto={`A todo el Perú${t.entrega.agencias.length ? ` · ${t.entrega.agencias.join(", ")}` : ""}`}
                  precio="Según agencia"
                />
              )}
              {t.entrega.motorizado && (
                <FilaEntrega
                  icono={<Bike className="size-5" />}
                  titulo="Delivery con motorizado"
                  texto={t.entrega.zonas_motorizado || "Dentro de la ciudad"}
                  precio={t.entrega.costo_motorizado_centimos ? soles(t.entrega.costo_motorizado_centimos) : "A coordinar"}
                />
              )}
            </section>

            <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-linea/60">
              <p className="flex items-center gap-2 font-bold text-tinta">
                <ShieldCheck className="size-5 text-pino" /> Tu compra en VendiGo está protegida
              </p>
              <ul className="mt-3 space-y-2.5 text-[15px] text-tinta/80">
                {[
                  "Pagas en la app (Yape, tarjeta o PagoEfectivo): queda protegido hasta que recibas tu pedido.",
                  "Ves cada paso: preparación, código de agencia o motorizado.",
                  "Si algo sale mal, lo reportas en 1 clic y VendiGo media con la tienda.",
                ].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-pino" /> {x}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[22px] bg-white p-6 ring-1 ring-linea/50">
            <h2 className="border-b border-linea pb-4 text-xl font-extrabold text-tinta">Ficha del producto</h2>
            <dl>
              {ficha.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[140px_1fr] border-b border-linea/70 py-3.5 text-[15px]">
                  <dt className="text-gris">{k}</dt>
                  <dd className="font-semibold text-tinta">{v}</dd>
                </div>
              ))}
            </dl>
            {p.descripcion && <p className="mt-5 leading-relaxed text-gris">{p.descripcion}</p>}
          </section>

          <section id="preguntas" className="scroll-mt-24 rounded-[22px] bg-white p-6 ring-1 ring-linea/50">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-extrabold text-tinta">Preguntas de otros compradores</h2>
              {preguntas.length > 0 && <span className="text-sm font-semibold text-tinta">● {preguntas.length}</span>}
            </div>
            <p className="mt-1 border-b border-linea pb-4 text-sm text-gris">
              Sin chat: la tienda responde una vez y todos lo ven.
            </p>
            {preguntas.length ? (
              <ul>
                {preguntas.map((q, i) => (
                  <li key={i} className="border-b border-linea/70 py-4 last:border-0">
                    <p className="flex gap-3 text-tinta">
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-pino text-xs font-bold text-white">P</span>
                      {q.pregunta}
                    </p>
                    <div className="mt-2 flex gap-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-arena text-xs font-bold text-tinta">R</span>
                      <div>
                        {q.respuesta ? (
                          <>
                            <p className="text-gris">{q.respuesta}</p>
                            <p className="mt-1 text-xs text-gris">
                              {t.nombre} respondió · {hace(q.respondida_en ?? q.creado_en)}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="italic text-gris">La tienda aún no responde. Te avisamos cuando lo haga.</p>
                            <p className="mt-1 text-xs italic text-gris">Preguntado {hace(q.creado_en)}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid place-items-center py-8 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-arena text-pino">
                  <CircleHelp className="size-6" />
                </span>
                <p className="mt-3 font-bold text-tinta">Aún no hay preguntas</p>
                <p className="mt-1 text-sm text-gris">Sé el primero en preguntar.</p>
              </div>
            )}
            <BotonPregunta />
          </section>
        </div>

        <section className="mt-5 rounded-[22px] bg-white p-6 ring-1 ring-linea/50">
          <h2 className="text-xl font-extrabold text-tinta">Opiniones de compras reales</h2>
          <div className="grid place-items-center py-10 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-arena text-pino">
              <MessageCircle className="size-6" />
            </span>
            <p className="mt-3 font-bold text-tinta">Aún no hay opiniones</p>
            <p className="mt-1 max-w-sm text-sm text-gris">Solo opinan quienes compraron. Aparecen cuando reciben su pedido.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function FilaEntrega({ icono, titulo, texto, precio }: { icono: React.ReactNode; titulo: string; texto: string; precio: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-linea/70 py-4 last:border-0">
      <span className="text-tinta">{icono}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-tinta">{titulo}</p>
        <p className="text-sm text-gris">{texto}</p>
      </div>
      <span className="shrink-0 text-sm font-bold text-tinta">{precio}</span>
    </div>
  );
}
