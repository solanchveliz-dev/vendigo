"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  Crown,
 
  Lock,
  ArrowUpRight,
  CalendarDays,
  Eye,
  Loader2,
  Minus,
  Package,
  ReceiptText,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { Boton, Cargando, Entrada, cn, useAvisar } from "@/components/ui";

type Barra = { etiqueta: string; valor: number };
type Pronostico = {
  producto_id: string;
  nombre: string;
  imagen_url: string;
  stock: number;
  vendidos: number;
  vendidos_anterior: number;
  cambio_pct: number | null;
  semanas: number[];
  pronostico_4sem: number;
  dias_para_agotar: number | null;
  tendencia: "sube" | "baja" | "estable" | "pocas" | "sin_datos";
  visitas: number;
};
type Analitica = {
  dias: number;
  plan: string;
  completa: boolean;
  tres_meses: boolean;
  ventas_centimos: number;
  ventas_anterior_centimos: number;
  neto_centimos: number;
  pedidos: number;
  pedidos_anterior: number;
  unidades: number;
  clientes: number;
  clientes_nuevos: number;
  clientes_recurrentes: number;
  serie: Barra[];
  entregas: Barra[];
  dias_semana: Barra[];
  productos: Pronostico[];
};
type Recomendacion = { tipo: string; titulo: string; texto: string };
type Analisis = { resumen: string; recomendaciones: Recomendacion[] };

const PREGUNTAS = [
  "¿Qué debo reponer?",
  "¿Qué producto promociono?",
  "¿Qué no se está vendiendo?",
  "¿Qué días vendo más?",
];

function Indicador({
  titulo,
  valor,
  detalle,
  icono,
  oscuro,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  icono: React.ReactNode;
  oscuro?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] p-5 shadow-suave ring-1",
        oscuro ? "bg-pino text-white ring-pino" : "bg-white ring-linea/60",
      )}
    >
      <div className="flex items-start justify-between">
        <p className={cn("text-sm", oscuro ? "text-white/80" : "text-gris")}>
          {titulo}
        </p>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-xl",
            oscuro ? "bg-white/10 text-coral" : "bg-crema text-tinta",
          )}
        >
          {icono}
        </span>
      </div>
      <p className="mt-3 font-display text-[28px] font-extrabold leading-tight">
        {valor}
      </p>
      <p
        className={cn(
          "mt-1 min-h-4 text-xs font-semibold",
          oscuro ? "text-white/80" : "text-tinta",
        )}
      >
        {detalle}
      </p>
      {oscuro && (
        <div className="absolute -bottom-10 -right-6 size-24 rounded-full bg-white/10" />
      )}
    </div>
  );
}

function variacion(actual: number, antes: number) {
  if (!antes) return "";
  const v = Math.round(((actual - antes) / antes) * 100);
  return `${v >= 0 ? "+" : ""}${v}% vs. periodo anterior`;
}

function Barras({ datos, formato }: { datos: Barra[]; formato: (v: number) => string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const muchas = datos.length > 8; // 3 meses = 13 semanas: etiquetas cortas para que entren
  return (
    <div className={cn("flex h-48 items-end", muchas ? "gap-1" : "gap-3 sm:gap-6")}>
      {datos.map((d, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2" title={`${d.etiqueta}: ${formato(d.valor)}`}>
          {!muchas && <span className="text-[11px] text-gris">{d.valor ? formato(d.valor) : ""}</span>}
          <div className={cn("w-full rounded-md", muchas ? "max-w-6" : "max-w-12 rounded-lg", i === datos.length - 1 ? "bg-pino" : "bg-linea/70")} style={{ height: `${Math.max(6, (d.valor / max) * 140)}px` }} />
          <span className="whitespace-nowrap text-[11px] text-gris">{muchas ? d.etiqueta.replace("Sem ", "S") : d.etiqueta}</span>
        </div>
      ))}
    </div>
  );
}

const TONOS = ["text-pino", "text-coral", "text-linea"];
function Dona({
  datos,
  centro,
  etiqueta,
}: {
  datos: Barra[];
  centro: string;
  etiqueta: string;
}) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  const r = 15.9155;
  let acumulado = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 36 36" className="size-full -rotate-90">
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            strokeWidth="5"
            className="stroke-arena"
          />
          {total > 0 &&
            datos.map((d, i) => {
              const pct = (d.valor / total) * 100;
              const el = (
                <circle
                  key={i}
                  cx="18"
                  cy="18"
                  r={r}
                  fill="none"
                  strokeWidth="5"
                  stroke="currentColor"
                  className={TONOS[i % TONOS.length]}
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={-acumulado}
                />
              );
              acumulado += pct;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <span>
            <b className="block font-display text-xl">{centro}</b>
            <span className="text-xs text-gris">{etiqueta}</span>
          </span>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {datos.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className={cn(
                "size-3 rounded-sm bg-current",
                TONOS[i % TONOS.length],
              )}
            />{" "}
            {d.etiqueta} ·{" "}
            <b>{total ? Math.round((d.valor / total) * 100) : 0}%</b>
          </li>
        ))}
        {!total && <li className="text-gris">Sin datos en este periodo.</li>}
      </ul>
    </div>
  );
}

const ICONO_REC: Record<string, React.ReactNode> = {
  reponer: <AlertTriangle className="size-[18px]" />,
  impulsar: <TrendingUp className="size-[18px]" />,
  revisar: <Eye className="size-[18px]" />,
  dias: <CalendarDays className="size-[18px]" />,
  general: <Sparkles className="size-[18px]" />,
};

function Tendencia({ t }: { t: Pronostico["tendencia"] }) {
  if (t === "sube")
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-ok">
        <ArrowUpRight className="size-4" /> Sube
      </span>
    );
  if (t === "baja")
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-error">
        <ArrowDownRight className="size-4" /> Baja
      </span>
    );
  if (t === "estable")
    return (
      <span className="inline-flex items-center gap-1 text-tinta">
        <Minus className="size-4" /> Estable
      </span>
    );
  if (t === "pocas") return <span className="text-gris">Pocas ventas</span>;
  return <span className="text-gris">Sin ventas</span>;
}

// Mini gráfico de las últimas 8 semanas de un producto.
function Mini({ v }: { v: number[] }) {
  const max = Math.max(1, ...v);
  return (
    <span className="flex h-6 items-end gap-0.5">
      {v.map((x, i) => (
        <span
          key={i}
          className={cn(
            "w-1.5 rounded-sm",
            i === v.length - 1 ? "bg-pino" : "bg-linea",
          )}
          style={{ height: `${Math.max(2, (x / max) * 24)}px` }}
        />
      ))}
    </span>
  );
}

export default function AnaliticaPagina() {
  const [dias, setDias] = useState(30);
  const { datos: a } = useApi<Analitica>(`/vendedor/analitica?dias=${dias}`);
  const [puedeTresMeses, setPuedeTresMeses] = useState<boolean | null>(null);
  if (a && puedeTresMeses === null) setPuedeTresMeses(a.tres_meses);
  const ia = useApi<{ quedan: number }>("/vendedor/ia");
  const avisar = useAvisar();
  const [pregunta, setPregunta] = useState("");
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [analizando, setAnalizando] = useState(false);

  async function analizar(q = pregunta) {
    setAnalizando(true);
    try {
      const r = await api.post<{ analisis: Analisis }>(
        "/vendedor/ia/analista",
        { pregunta: q, dias },
      );
      setAnalisis(r.analisis);
      ia.recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setAnalizando(false);
    }
  }

  const top = a
    ? [...a.productos].filter((p) => p.vendidos > 0).slice(0, 5)
    : [];
  const maxTop = Math.max(1, ...top.map((p) => p.vendidos));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
          <h1 className="text-[34px] font-extrabold leading-tight text-pino">
            Analítica
          </h1>
          <p className="text-sm text-gris">
            Cómo le va a tu tienda, qué se vende más y qué pasará las próximas
            semanas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full bg-white p-1 ring-1 ring-linea">
            {[
              [7, "7 días"],
              [30, "30 días"],
              [90, "3 meses"],
            ].map(([d, t]) => {
              const bloqueado = d === 90 && puedeTresMeses === false;
              return (
                <button
                  key={d}
                  title={
                    bloqueado
                      ? "Disponible en los planes Crece y Pro"
                      : undefined
                  }
                  onClick={() =>
                    bloqueado
                      ? avisar(
                          "Ver 3 meses está disponible en los planes Crece y Pro.",
                          "error",
                        )
                      : (setDias(d as number), setAnalisis(null))
                  }
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition",
                    dias === d
                      ? "bg-pino text-white"
                      : "text-tinta hover:bg-crema",
                    bloqueado && "text-gris",
                  )}
                >
                  {bloqueado && <Lock className="size-3.5" />} {t}
                </button>
              );
            })}
          </div>

        </div>
      </div>

      {!a ? (
        <Cargando />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Indicador
              oscuro
              titulo="Ventas"
              valor={soles(a.ventas_centimos)}
              detalle={variacion(a.ventas_centimos, a.ventas_anterior_centimos)}
              icono={<Wallet className="size-[18px]" />}
            />
            <Indicador
              titulo="Ingresos netos"
              valor={soles(a.neto_centimos)}
              detalle="Después de costos de pago"
              icono={<ReceiptText className="size-[18px]" />}
            />
            <Indicador
              titulo="Pedidos"
              valor={String(a.pedidos)}
              detalle={
                a.pedidos_anterior
                  ? `${a.pedidos - a.pedidos_anterior >= 0 ? "+" : ""}${a.pedidos - a.pedidos_anterior} vs. periodo anterior`
                  : ""
              }
              icono={<ShoppingBag className="size-[18px]" />}
            />
            <Indicador
              titulo="Productos vendidos"
              valor={String(a.unidades)}
              detalle="Unidades"
              icono={<Package className="size-[18px]" />}
            />
            <Indicador
              titulo="Clientes"
              valor={String(a.clientes)}
              detalle={a.clientes_nuevos ? `${a.clientes_nuevos} nuevos` : ""}
              icono={<Users className="size-[18px]" />}
            />
          </div>

          {!a.completa && (
            <section className="flex flex-wrap items-center gap-5 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-coral-claro text-coral">
                <Crown className="size-6" />
              </span>
              <div className="min-w-[240px] flex-1">
                <p className="font-extrabold text-tinta">
                  Pronóstico y analista de ventas con IA
                </p>
                <p className="text-sm text-gris">
                  Desde el plan <b>Emprende</b>: qué productos se venden más y
                  menos, cuánto venderás las próximas semanas, cuándo se te
                  acaba el stock y recomendaciones de la IA sobre qué reponer,
                  impulsar o revisar.
                </p>
              </div>
              <Link href="/vendedor/plan">
                <Boton>Ver planes</Boton>
              </Link>
            </section>
          )}

          {/* Analista de ventas con IA */}
          {a.completa && (
            <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-extrabold text-tinta">
                    <Sparkles className="size-5 text-coral" /> Tu analista de
                    ventas
                  </h3>
                  <p className="text-sm text-gris">
                    La IA revisa tus ventas, el pronóstico y tu stock, y te dice
                    qué hacer. Solo usa los datos de tu tienda.
                  </p>
                </div>
                <span className="rounded-full bg-arena px-3 py-1 text-xs font-semibold">
                  2 créditos{ia.datos ? ` · te quedan ${ia.datos.quedan}` : ""}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {PREGUNTAS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={analizando}
                    onClick={() => {
                      setPregunta(q);
                      analizar(q);
                    }}
                    className="rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-tinta ring-1 ring-linea hover:bg-crema disabled:opacity-60"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Entrada
                  value={pregunta}
                  maxLength={200}
                  onChange={(e) => setPregunta(e.target.value)}
                  placeholder="O escribe tu pregunta (opcional)"
                  onKeyDown={(e) => e.key === "Enter" && analizar()}
                />
                <Boton
                  variante="acento"
                  cargando={analizando}
                  onClick={() => analizar()}
                  className="shrink-0"
                >
                  <Sparkles className="size-4" /> Analizar mis ventas
                </Boton>
              </div>

              {analizando && !analisis && (
                <p className="mt-5 flex items-center gap-2 text-sm text-gris">
                  <Loader2 className="size-4 animate-spin" /> Revisando tus
                  ventas…
                </p>
              )}
              {analisis && (
                <div
                  className={cn("mt-5 space-y-3", analizando && "opacity-60")}
                >
                  <p className="rounded-2xl bg-pino-claro px-4 py-3 text-sm font-semibold text-tinta">
                    {analisis.resumen}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {analisis.recomendaciones.map((r, i) => (
                      <div
                        key={i}
                        className="flex gap-3 rounded-2xl p-4 ring-1 ring-linea"
                      >
                        <span
                          className={cn(
                            "grid size-10 shrink-0 place-items-center rounded-xl",
                            r.tipo === "reponer"
                              ? "bg-aviso-claro text-aviso"
                              : r.tipo === "revisar"
                                ? "bg-error-claro text-error"
                                : r.tipo === "impulsar"
                                  ? "bg-pino-claro text-pino"
                                  : "bg-crema text-tinta",
                          )}
                        >
                          {ICONO_REC[r.tipo] ?? ICONO_REC.general}
                        </span>
                        <div>
                          <p className="font-bold text-tinta">{r.titulo}</p>
                          <p className="text-sm text-gris">{r.texto}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gris">
                    Son recomendaciones: revísalas antes de actuar. El
                    pronóstico es una estimación con tus últimas 8 semanas.
                  </p>
                </div>
              )}
            </section>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
              <h3 className="mb-4 text-lg font-extrabold text-tinta">
                {a.dias === 7 ? "Ventas por día" : "Ventas por semana"}
              </h3>
              <Barras
                datos={a.serie}
                formato={(v) => soles(v).replace(".00", "")}
              />
            </section>
            <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
              <h3 className="mb-4 text-lg font-extrabold text-tinta">
                Cómo entregas
              </h3>
              <Dona
                datos={a.entregas}
                centro={String(a.pedidos)}
                etiqueta="pedidos"
              />
            </section>
            {a.completa && (
              <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
                <h3 className="mb-4 text-lg font-extrabold text-tinta">
                  Productos que más venden
                </h3>
                {!top.length ? (
                  <p className="text-sm text-gris">
                    Aún no hay ventas en este periodo.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {top.map((p, i) => (
                      <div
                        key={p.producto_id}
                        className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3 text-sm"
                      >
                        <span className="truncate">{p.nombre}</span>
                        <span className="h-2.5 overflow-hidden rounded-full bg-arena">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              i < 2 ? "bg-pino" : "bg-linea",
                            )}
                            style={{ width: `${(p.vendidos / maxTop) * 100}%` }}
                          />
                        </span>
                        <b className="text-right">{p.vendidos}</b>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
            {a.completa && (
              <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
                <h3 className="mb-4 text-lg font-extrabold text-tinta">
                  Clientes
                </h3>
                <Dona
                  datos={[
                    { etiqueta: "Recurrentes", valor: a.clientes_recurrentes },
                    { etiqueta: "Nuevos", valor: a.clientes_nuevos },
                  ]}
                  centro={String(a.clientes)}
                  etiqueta="clientes"
                />
              </section>
            )}
          </div>

          {a.completa && (
            <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
              <h3 className="text-lg font-extrabold text-tinta">
                Pronóstico de tus productos
              </h3>
              <p className="mb-3 text-sm text-gris">
                Estimado con la tendencia de tus últimas 8 semanas. No gasta
                créditos.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-gris">
                      <th className="py-2 pr-3">Producto</th>
                      <th className="px-3 py-2">8 semanas</th>
                      <th className="px-3 py-2 text-right">Vendidos</th>
                      <th className="px-3 py-2 text-right">Vs. antes</th>
                      <th className="px-3 py-2">Tendencia</th>
                      <th className="px-3 py-2 text-right">
                        Próximas 4 semanas
                      </th>
                      <th className="px-3 py-2 text-right">Stock</th>
                      <th className="py-2 pl-3 text-right">Se agota en</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linea">
                    {a.productos.map((p) => (
                      <tr key={p.producto_id}>
                        <td className="py-2.5 pr-3">
                          <Link
                            href={`/vendedor/productos/${p.producto_id}`}
                            className="flex items-center gap-2.5 font-semibold text-tinta hover:underline"
                          >
                            <span className="size-8 shrink-0 overflow-hidden rounded-lg bg-arena">
                              {p.imagen_url && (
                                <img
                                  src={p.imagen_url}
                                  alt=""
                                  className="size-full object-cover"
                                />
                              )}
                            </span>
                            <span className="truncate">{p.nombre}</span>
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <Mini v={p.semanas} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {p.vendidos}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right",
                            p.cambio_pct == null
                              ? "text-gris"
                              : p.cambio_pct >= 0
                                ? "text-ok"
                                : "text-error",
                          )}
                        >
                          {p.cambio_pct == null
                            ? "—"
                            : `${p.cambio_pct >= 0 ? "+" : ""}${p.cambio_pct}%`}
                        </td>
                        <td className="px-3 py-2.5">
                          <Tendencia t={p.tendencia} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">
                          {p.tendencia === "sin_datos"
                            ? "—"
                            : `~${p.pronostico_4sem}`}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right",
                            p.stock <= 3 && "font-bold text-error",
                          )}
                        >
                          {p.stock}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          {p.dias_para_agotar == null ? (
                            <span className="text-gris">—</span>
                          ) : p.dias_para_agotar === 0 ? (
                            <span className="font-bold text-error">
                              Agotado
                            </span>
                          ) : (
                            <span
                              className={cn(
                                p.dias_para_agotar <= 14 &&
                                  "font-bold text-aviso",
                              )}
                            >
                              ~{p.dias_para_agotar} días
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
