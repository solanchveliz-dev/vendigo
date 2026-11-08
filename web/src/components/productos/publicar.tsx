"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Backpack, BatteryCharging, CakeSlice, Camera, Check, Coffee, Cookie, Copy, CupSoda, Droplet, Dumbbell, Eye, Flame, FlaskConical, Footprints,
  Gem, Headphones, Image as Imagen, Info, Link2, Loader2, Minus, Palette, Pencil, Plus, Sandwich, Search, Shirt, ShoppingBag, ShoppingBasket,
  Smartphone, Sofa, Sparkles, SprayCan, Square, Star, Sun, UtensilsCrossed, Watch, X, Zap,
} from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { subirImagen } from "@/lib/subir";
import { soles } from "@/lib/formato";
import type { Producto, Tienda } from "@/lib/tipos";
import {
  CARACTERISTICAS, CATALOGO, COLORES, DATOS_FICHA, GRUPOS_SUGERIDOS, RUBROS_PUBLICAR, leerFicha, rubroPublicar, type Dim, type TipoProducto,
} from "@/lib/catalogo-productos";
import { useAvisar } from "@/components/ui";

/* ---------- Íconos ---------- */
const ICONO_TIPO: Record<string, React.ElementType> = {
  polo: Shirt, casaca: Shirt, camisa: Shirt, vestido: Shirt, pantalon: Shirt, ropa: Shirt, bata: Shirt, zapatillas: Footprints, sombrero: Sun,
  mochila: Backpack, bolso: ShoppingBag, serum: Droplet, crema: FlaskConical, aceite: Droplet, perfume: SprayCan, labial: Palette, vela: Flame,
  taza: Coffee, cojin: Square, canasta: ShoppingBasket, smartwatch: Watch, reloj: Watch, audifonos: Headphones, cargador: BatteryCharging,
  funda: Smartphone, pancakes: CakeSlice, plato: UtensilsCrossed, sandwich: Sandwich, alfajores: Cookie, cafe: Coffee, aretes: Gem, collar: Gem,
  anillo: Gem, pulsera: Gem, mat: Dumbbell, botella: CupSoda,
};
const ICONO_RUBRO: Record<string, React.ElementType> = { moda: Shirt, belleza: Droplet, hogar: Sofa, tecnologia: Headphones, alimentos: CakeSlice, artesanias: Gem, deportes: Dumbbell };

/* ---------- Estado del formulario ---------- */
type Borrador = { n: string; dims: Dim[] };
type Estado = {
  cat: string;
  tipo: string | null; // id del tipo, "otro" o "mio_..."
  sel: Record<string, string[]>;
  extra: Record<string, string[]>; // opciones propias agregadas a cada grupo
  coloresPropios: [string, string][];
  feats: string[];
  featsPropias: string[];
  nombre: string;
  nombreTocado: boolean;
  precio: string;
  stock: number;
  desc: string;
  descTocada: boolean;
  ficha: Record<string, string>;
  fichaOn: string[];
  borrador: Borrador | null;
};

const inicial = (cat: string): Estado => ({
  cat, tipo: null, sel: {}, extra: {}, coloresPropios: [], feats: [], featsPropias: [], nombre: "", nombreTocado: false, precio: "", stock: 10,
  desc: "", descTocada: false, ficha: {}, fichaOn: [], borrador: null,
});

const CLAVE_MIS_TIPOS = "vendigo-mis-tipos";
function leerMisTipos(): TipoProducto[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_MIS_TIPOS) || "[]");
  } catch {
    return [];
  }
}

const hexDe = (n: string, propios: [string, string][]) => (COLORES.find((c) => c[0] === n) || propios.find((c) => c[0] === n) || [n, "#cccccc"])[1];
const etiquetaGrupo = (d: Dim) => (d.k === "talla" ? "Talla" : d.label);

// Lo que se guarda del formulario para poder volver a editarlo igual.
type Detalles = {
  tipo?: string; tipo_nombre?: string; rubro?: string; sel?: Record<string, string[]>; extra?: Record<string, string[]>;
  colores?: [string, string][]; colores_propios?: [string, string][]; caracteristicas?: string[]; caracteristicas_propias?: string[];
  ficha?: [string, string][]; ficha_on?: string[]; grupos?: { label: string; opts: string[] }[]; borrador?: Borrador | null;
  nombre_tocado?: boolean; desc_tocada?: boolean;
};

export function PublicarProducto({ producto }: { producto?: Producto }) {
  const router = useRouter();
  const avisar = useAvisar();
  const tienda = useApi<Tienda>("/vendedor/tienda");
  const ia = useApi<{ quedan: number; costos?: Record<string, number> }>("/vendedor/ia");
  const [q, setQ] = useState<Estado>(() => inicial("artesanias"));
  const [fotos, setFotos] = useState<{ key: string; url: string }[]>([]);
  const [misTipos, setMisTipos] = useState<TipoProducto[]>([]);
  const [verRubros, setVerRubros] = useState(false);
  const [busca, setBusca] = useState("");
  const [abrirColor, setAbrirColor] = useState(false);
  const [abrirPegar, setAbrirPegar] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [leyendoIA, setLeyendoIA] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState("");
  const [listo, setListo] = useState<Producto | null>(null);
  const listoInicio = useRef(false);

  // Rubro de la tienda y datos del producto al editar
  useEffect(() => {
    setMisTipos(leerMisTipos());
  }, []);
  useEffect(() => {
    if (!tienda.datos || listoInicio.current) return;
    listoInicio.current = true;
    const cat = rubroPublicar(tienda.datos.rubro);
    if (!producto) return setQ(inicial(cat));
    const d = (producto.detalles ?? {}) as Detalles;
    const base = inicial(d.rubro || cat);
    const mismo = d.tipo && d.tipo !== "otro" ? [...(CATALOGO[d.rubro || cat] ?? []), ...leerMisTipos()].find((t) => t.id === d.tipo) : null;
    const dimsBase = mismo ? mismo.dims : d.borrador?.dims ?? [];
    const propias = new Set(["Características", ...dimsBase.filter((x) => x.type === "one").map((x) => x.label)]);
    setQ({
      ...base,
      tipo: mismo ? mismo.id : "otro",
      borrador: mismo ? null : d.borrador ?? { n: producto.categoria || "", dims: [] },
      sel: d.sel ?? {},
      extra: d.extra ?? {},
      coloresPropios: d.colores_propios ?? [],
      feats: d.caracteristicas ?? [],
      featsPropias: d.caracteristicas_propias ?? [],
      nombre: producto.nombre,
      nombreTocado: true,
      precio: String(producto.precio_centimos / 100),
      stock: producto.stock,
      desc: producto.descripcion,
      descTocada: true,
      // La ficha guardada también trae lo que sale de las opciones (Material, Características…): eso no se repite aquí.
      ficha: Object.fromEntries((d.ficha ?? []).filter(([k]) => !propias.has(k))),
      fichaOn: (d.ficha_on ?? (d.ficha ?? []).map(([k]) => k)).filter((k) => !propias.has(k)),
    });
    setFotos(producto.imagenes);
  }, [tienda.datos, producto]);

  const tipos = useMemo(() => CATALOGO[q.cat] ?? CATALOGO.artesanias, [q.cat]);
  const t: TipoProducto | null = useMemo(() => {
    if (!q.tipo) return null;
    if (q.tipo === "otro") return { id: "otro", n: q.borrador?.n ?? "", prices: [], dims: q.borrador?.dims ?? [] };
    return tipos.find((x) => x.id === q.tipo) ?? misTipos.find((x) => x.id === q.tipo) ?? Object.values(CATALOGO).flat().find((x) => x.id === q.tipo) ?? null;
  }, [q.tipo, q.borrador, tipos, misTipos]);

  /* ---------- Nombre y descripción automáticos ---------- */
  function auto(s: Estado, tipo: TipoProducto | null): Estado {
    if (!tipo) return s;
    const mat = (s.sel.mat || [])[0];
    const w = tipo.nameWord === undefined ? "de" : tipo.nameWord;
    const n = { ...s };
    if (!s.nombreTocado) n.nombre = tipo.n + (mat ? (w ? ` ${w} ` : " ") + mat.toLowerCase() : "");
    if (!s.descTocada) {
      const partes: string[] = [];
      tipo.dims.forEach((d) => {
        const v = s.sel[d.k] || [];
        if (!v.length || d.k === "mat") return;
        partes.push(`${d.label.replace(" disponibles", "")}: ${v.join(", ")}`);
      });
      const feats = s.feats.length ? ` ${s.feats.join(". ")}.` : "";
      n.desc = `${n.nombre}. ${partes.join(". ")}${partes.length ? "." : ""}${feats} Hecho por ${tienda.datos?.nombre ?? "nuestra tienda"}.`.replace(/\.\s+\./g, ".");
    }
    return n;
  }
  const cambiar = (f: (s: Estado) => Estado) => setQ((s) => auto(f(s), t));

  function elegirTipo(tipo: TipoProducto, cat?: string) {
    const sel: Record<string, string[]> = {};
    tipo.dims.forEach((d) => (sel[d.k] = d.def.slice()));
    setBusca("");
    setQ((s) =>
      auto(
        { ...s, cat: cat ?? s.cat, tipo: tipo.id, sel, extra: {}, feats: [], borrador: null, nombreTocado: false, descTocada: false, precio: s.precio || String(tipo.prices[1] ?? tipo.prices[0] ?? "") },
        tipo,
      ),
    );
  }
  function crearMio(nombre = "") {
    setBusca("");
    setQ((s) => ({ ...s, tipo: "otro", sel: {}, extra: {}, feats: [], borrador: { n: nombre, dims: [] }, nombre, nombreTocado: !!nombre, desc: "", descTocada: true }));
  }

  function tocar(d: Dim, v: string) {
    cambiar((s) => {
      const cur = s.sel[d.k] || [];
      const nuevo = d.type === "one" ? [v] : cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
      return { ...s, sel: { ...s.sel, [d.k]: nuevo } };
    });
  }
  function otraOpcion(d: Dim, v: string) {
    v = v.trim();
    if (!v) return;
    cambiar((s) => ({
      ...s,
      extra: { ...s.extra, [d.k]: [...new Set([...(s.extra[d.k] || []), v])] },
      sel: { ...s.sel, [d.k]: d.type === "one" ? [v] : [...new Set([...(s.sel[d.k] || []), v])] },
    }));
  }
  function otroColor(nombre: string, hex: string) {
    const n = nombre.trim() || `Color ${q.coloresPropios.length + 1}`;
    cambiar((s) => ({ ...s, coloresPropios: [...s.coloresPropios.filter((c) => c[0] !== n), [n, hex]], sel: { ...s.sel, color: [...new Set([...(s.sel.color || []), n])] } }));
    setAbrirColor(false);
  }
  function tocarFeat(f: string) {
    cambiar((s) => ({ ...s, feats: s.feats.includes(f) ? s.feats.filter((x) => x !== f) : [...s.feats, f] }));
  }
  function otraFeat(v: string) {
    v = v.trim();
    if (!v) return;
    cambiar((s) => ({ ...s, featsPropias: [...new Set([...s.featsPropias, v])], feats: [...new Set([...s.feats, v])] }));
  }

  /* ---------- "Crear el mío": armar opciones ---------- */
  function agregarGrupo(label: string, opts: string[] = []) {
    label = label.trim();
    if (!label || !q.borrador) return;
    if (q.borrador.dims.some((x) => x.label.toLowerCase() === label.toLowerCase())) return avisar(`Ya agregaste ${label}`, "error");
    const esColor = /^colou?r/i.test(label);
    const d: Dim = esColor ? { k: "color", label: "Colores disponibles", type: "color", opts: [], def: [] } : { k: "g" + Date.now().toString(36), label, type: "multi", opts, def: opts };
    setQ((s) => ({ ...s, borrador: { ...s.borrador!, dims: [...s.borrador!.dims, d] }, sel: esColor ? s.sel : { ...s.sel, [d.k]: opts.slice() } }));
  }
  function quitarGrupo(k: string) {
    setQ((s) => {
      const sel = { ...s.sel };
      delete sel[k];
      return { ...s, sel, borrador: { ...s.borrador!, dims: s.borrador!.dims.filter((x) => x.k !== k) } };
    });
  }
  function guardarTipo() {
    if (!q.borrador?.n.trim()) return;
    const nuevo: TipoProducto = {
      id: "mio_" + Date.now().toString(36), n: q.borrador.n.trim(), prices: [], mine: true,
      dims: q.borrador.dims.map((x) => (x.type === "color" ? x : { ...x, opts: [...new Set([...x.opts, ...(q.extra[x.k] || [])])] })),
    };
    const lista = [...misTipos, nuevo];
    setMisTipos(lista);
    try {
      localStorage.setItem(CLAVE_MIS_TIPOS, JSON.stringify(lista));
    } catch {}
    setQ((s) => ({ ...s, tipo: nuevo.id, borrador: null }));
    avisar(`“${nuevo.n}” queda guardado en tus tipos de producto`);
  }

  /* ---------- Fotos e IA ---------- */
  async function agregarFotos(archivos: FileList | null) {
    if (!archivos?.length) return;
    setSubiendo(true);
    try {
      const nuevas: { key: string; url: string }[] = [];
      for (const a of Array.from(archivos).slice(0, 6 - fotos.length)) nuevas.push(await subirImagen(a, "producto"));
      setFotos((x) => [...x, ...nuevas].slice(0, 6));
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setSubiendo(false);
    }
  }
  async function usarFotoIA(archivos: FileList | null) {
    if (!archivos?.length) return;
    setLeyendoIA(true);
    try {
      const f = await subirImagen(archivos[0], "producto");
      setFotos((x) => [f, ...x].slice(0, 6));
      const r = await api.post<{ sugerencia: { nombre: string; descripcion: string; categoria: string; caracteristicas: string[] } }>("/vendedor/ia/publicar-con-foto", { imagen_key: f.key });
      const s = r.sugerencia;
      const tipo = Object.values(CATALOGO).flat().find((x) => s.categoria && x.n.toLowerCase().includes(s.categoria.toLowerCase().split(" ")[0]));
      setQ((st) => ({
        ...st,
        tipo: tipo ? tipo.id : "otro",
        borrador: tipo ? null : { n: s.categoria || s.nombre, dims: [] },
        sel: tipo ? Object.fromEntries(tipo.dims.map((d) => [d.k, d.def.slice()])) : {},
        nombre: s.nombre, nombreTocado: true, desc: s.descripcion, descTocada: true,
        feats: s.caracteristicas ?? [], featsPropias: s.caracteristicas ?? [],
      }));
      ia.recargar();
      avisar("La IA completó el producto. Revísalo antes de publicar.");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setLeyendoIA(false);
    }
  }

  /* ---------- Lo que verá el cliente ---------- */
  const grupos = (t?.dims ?? []).filter((d) => d.type === "multi" && (q.sel[d.k] || []).length).map((d) => ({ label: etiquetaGrupo(d), opts: q.sel[d.k] }));
  const coloresSel = q.sel.color || [];
  const ficha: [string, string][] = [
    ...(t?.dims ?? []).filter((d) => d.type === "one" && (q.sel[d.k] || [])[0]).map((d) => [d.label, q.sel[d.k][0]] as [string, string]),
    ...(q.feats.length ? [["Características", q.feats.join(" · ")] as [string, string]] : []),
    ...Object.entries(q.ficha).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()] as [string, string]),
  ].filter(([k], i, a) => a.findIndex(([x]) => x === k) === i); // sin datos repetidos
  const variante = grupos[0] ?? (coloresSel.length ? { label: "Color", opts: coloresSel } : null);

  async function publicar() {
    const errs: string[] = [];
    if (!t) errs.push("Elige qué vendes");
    if (q.nombre.trim().length < 3) errs.push("Escribe el nombre");
    if (!(Number(q.precio) > 0)) errs.push("Pon un precio");
    if (!(q.stock >= 0)) errs.push("Pon el stock");
    if (!fotos.length) errs.push("Agrega al menos una foto");
    setErrores(errs.join(" · "));
    if (errs.length) return;

    // El stock total se reparte entre las opciones (ej. tallas) para que cada una tenga el suyo.
    const opciones = variante?.opts ?? [];
    const variantes = opciones.map((nombre, i) => ({
      nombre,
      stock: Math.floor(q.stock / opciones.length) + (i < q.stock % opciones.length ? 1 : 0),
      precio_centimos: null,
    }));
    const detalles: Detalles = {
      tipo: q.tipo ?? "otro", tipo_nombre: t?.n, rubro: q.cat, sel: q.sel, extra: q.extra,
      colores: coloresSel.map((n) => [n, hexDe(n, q.coloresPropios)] as [string, string]), colores_propios: q.coloresPropios,
      caracteristicas: q.feats, caracteristicas_propias: q.featsPropias, ficha, ficha_on: q.fichaOn, grupos,
      borrador: q.tipo === "otro" ? q.borrador : null,
    };
    const cuerpo = {
      nombre: q.nombre.trim(), descripcion: q.desc.trim(), categoria: t?.n ?? "", precio_centimos: Math.round(Number(q.precio) * 100),
      stock: q.stock, variantes, imagenes: fotos.map((f) => f.key), detalles,
    };
    setGuardando(true);
    try {
      if (producto) {
        await api.put(`/vendedor/productos/${producto.id}`, cuerpo);
        avisar("Cambios guardados");
        router.push(`/vendedor/productos/${producto.id}/vista`);
      } else {
        const p = await api.post<Producto>("/vendedor/productos", cuerpo);
        avisar("Producto publicado");
        setListo(p);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (e) {
      setErrores((e as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  async function copiarEnlace(p: Producto) {
    if (!tienda.datos) return;
    await navigator.clipboard.writeText(`${window.location.origin}/t/${tienda.datos.slug}/p/${p.id}`);
    avisar("Enlace copiado");
  }

  /* ---------- Pantalla final ---------- */
  if (listo)
    return (
      <>
        <Cabecera titulo="¡Listo!" texto="Tu producto ya está en tu tienda." migas="Nuevo" />
        <div className="flex flex-wrap items-center gap-6 rounded-[22px] bg-white p-8 shadow-suave ring-1 ring-linea/60">
          <div className="size-32 shrink-0 overflow-hidden rounded-2xl bg-arena">{listo.imagenes[0] && <img src={listo.imagenes[0].url} alt="" className="size-full object-cover" />}</div>
          <div>
            <h2 className="text-2xl font-extrabold text-tinta">“{listo.nombre}” está publicado</h2>
            <p className="mt-1 text-gris">Compártelo con tus clientes o publica otro en segundos.</p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <button onClick={() => { setListo(null); setFotos([]); setQ(inicial(q.cat)); }} className={btn("primario")}><Plus className="size-4" /> Publicar otro</button>
              <Link href={`/vendedor/productos/${listo.id}/vista`} className={btn("fantasma")}><Eye className="size-4" /> Ver cómo se ve</Link>
              <button onClick={() => copiarEnlace(listo)} className={btn("fantasma")}><Link2 className="size-4" /> Copiar enlace</button>
            </div>
          </div>
        </div>
      </>
    );

  if (!tienda.datos) return <p className="py-10 text-center text-gris">Cargando…</p>;

  const creditos = ia.datos?.quedan;
  const hallados = busca.trim()
    ? [
        ...Object.entries(CATALOGO).flatMap(([c, l]) => l.map((x) => ({ ...x, cat: c }))).filter((x) => x.n.toLowerCase().includes(busca.trim().toLowerCase())),
        ...misTipos.filter((x) => x.n.toLowerCase().includes(busca.trim().toLowerCase())).map((x) => ({ ...x, cat: q.cat })),
      ]
    : [];

  return (
    <>
      {producto ? (
        <Cabecera titulo="Editar producto" texto="Cambia lo que necesites tocando las opciones." migas="Editar">
          <Link href={`/vendedor/productos/${producto.id}/vista`} className={btn("fantasma")}><Eye className="size-4" /> Vista previa</Link>
        </Cabecera>
      ) : (
        <Cabecera titulo="Nuevo producto" texto="Toca en vez de escribir: elige qué vendes y marca lo que tienes." migas="Nuevo" />
      )}

      {/* Aviso de IA */}
      <label className="mb-5 flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-coral/60 bg-coral-claro/70 px-4 py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-coral"><Camera className="size-5" /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-sm text-tinta">¿Ya tienes la foto? La IA lo llena por ti</b>
          <span className="text-xs text-gris">Reconoce el producto y escribe nombre, descripción y opciones · 3 créditos{creditos !== undefined ? ` (te quedan ${creditos})` : ""}</span>
        </span>
        <span className={`${btn("primario")} !py-2`}>{leyendoIA ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Usar foto</span>
        <input type="file" accept="image/*" className="hidden" disabled={leyendoIA} onChange={(e) => usarFotoIA(e.target.files)} />
      </label>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {/* 1. ¿Qué vendes? */}
          <Paso n={1} titulo="¿Qué vendes?" texto={<>Rubro de tu tienda: {RUBROS_PUBLICAR.find((r) => r.id === q.cat)?.n} · <button onClick={() => setVerRubros(!verRubros)} className="font-semibold text-coral underline">cambiar</button></>}>
            {verRubros && (
              <div className="mb-3 flex flex-wrap gap-2">
                {RUBROS_PUBLICAR.map((r) => {
                  const I = ICONO_RUBRO[r.id];
                  return (
                    <button key={r.id} onClick={() => { setQ(inicial(r.id)); setVerRubros(false); }} className={chip(q.cat === r.id)}>
                      <I className="size-4" /> {r.n}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-linea focus-within:ring-pino">
              <Search className="size-[18px] text-gris" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Escribe lo que vendes: tortas, macetas, llaveros, cuadros…" className="w-full bg-transparent text-sm outline-none" />
            </div>
            {busca.trim() ? (
              <>
                <div className="flex flex-wrap gap-2.5">
                  {hallados.slice(0, 11).map((x) => <TipoBoton key={x.cat + x.id} t={x} on={q.tipo === x.id} onClick={() => elegirTipo(x, x.cat)} />)}
                  <TipoBoton t={{ id: "nuevo", n: `Crear “${busca.trim()}”`, prices: [], dims: [] }} otro on onClick={() => crearMio(busca.trim().charAt(0).toUpperCase() + busca.trim().slice(1))} />
                </div>
                {!hallados.length && <p className="mt-3 text-sm text-gris">No está en la lista, ¡no pasa nada! Créalo con sus propias opciones.</p>}
              </>
            ) : (
              <>
                {misTipos.length > 0 && (
                  <>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gris">Tus tipos de producto</p>
                    <div className="mb-4 flex flex-wrap gap-2.5">{misTipos.map((x) => <TipoBoton key={x.id} t={x} on={q.tipo === x.id} onClick={() => elegirTipo(x)} />)}</div>
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gris">Sugeridos para tu rubro</p>
                  </>
                )}
                <div className="flex flex-wrap gap-2.5">
                  {tipos.map((x) => <TipoBoton key={x.id} t={x} on={q.tipo === x.id} onClick={() => elegirTipo(x)} />)}
                  <TipoBoton t={{ id: "otro", n: "Crear el mío", prices: [], dims: [] }} otro on={q.tipo === "otro"} onClick={() => crearMio()} />
                </div>
              </>
            )}
          </Paso>

          {t && (
            <>
              {/* 2. Marca lo que tienes */}
              <Paso n={2} titulo="Marca lo que tienes" texto={q.tipo === "otro" ? "Arma las opciones de tu producto, a tu manera." : "Ya dejamos lo más común marcado. Puedes agregar las tuyas."}>
                <div className="flex flex-col gap-5 sm:flex-row">
                  <Fotos fotos={fotos} subiendo={subiendo} onAgregar={agregarFotos} onQuitar={(i) => setFotos((x) => x.filter((_, j) => j !== i))} />
                  <div className="min-w-0 flex-1 space-y-4">
                    {q.tipo === "otro" && q.borrador && (
                      <div className="rounded-2xl bg-coral-claro/60 p-4">
                        <label className="mb-1.5 block text-sm font-bold text-tinta">¿Cómo se llama este tipo de producto?</label>
                        <input
                          value={q.borrador.n}
                          onChange={(e) => {
                            const v = e.target.value;
                            setQ((s) => ({ ...s, borrador: { ...s.borrador!, n: v }, nombre: s.nombreTocado && s.nombre ? s.nombre : v }));
                          }}
                          placeholder="Ej. Torta personalizada, Llavero, Cuadro"
                          className="w-full rounded-xl bg-white px-4 py-3 text-sm outline-none ring-1 ring-linea focus:ring-pino"
                        />
                        <p className="mb-2 mt-4 text-sm font-bold text-tinta">¿Qué opciones elige tu cliente? <small className="font-normal text-gris">· agrega solo las que necesites</small></p>
                        <div className="flex flex-wrap gap-2">
                          {GRUPOS_SUGERIDOS.filter(([l]) => !q.borrador!.dims.some((d) => (d.type === "color" ? "color" : d.label.toLowerCase()) === (l === "Color" ? "color" : l.toLowerCase()))).map(([l, o]) => (
                            <button key={l} onClick={() => agregarGrupo(l, o)} className={chipAgregar}><Plus className="size-3.5" /> {l}</button>
                          ))}
                          <EntradaCorta placeholder="Otra opción…" onAgregar={(v) => agregarGrupo(v)} />
                        </div>
                      </div>
                    )}

                    {t.dims.map((d) => (
                      <div key={d.k}>
                        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-tinta">
                          {d.label}
                          {d.type !== "one" && <small className="font-normal text-gris">· {d.type === "color" ? "toca los que tengas" : "toca todas las que tengas"}</small>}
                          {q.tipo === "otro" && (
                            <button onClick={() => quitarGrupo(d.k)} className="grid size-5 place-items-center rounded-full bg-error-claro text-error" aria-label={`Quitar ${d.label}`}><X className="size-3" /></button>
                          )}
                        </p>
                        {d.type === "color" ? (
                          <>
                            <div className="flex flex-wrap gap-2">
                              {[...COLORES, ...q.coloresPropios].map(([n, hx]) => (
                                <button key={n} onClick={() => tocar(d, n)} className={`inline-flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-3.5 text-sm font-semibold ring-1 transition ${(q.sel.color || []).includes(n) ? "ring-2 ring-coral" : "ring-linea"}`}>
                                  <i className="size-6 rounded-full ring-1 ring-black/10" style={{ background: hx }} /> {n}
                                </button>
                              ))}
                              <button onClick={() => setAbrirColor(!abrirColor)} className={chipAgregar}><Plus className="size-3.5" /> Otro color</button>
                            </div>
                            {abrirColor && <NuevoColor onAgregar={otroColor} />}
                          </>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {[...d.opts, ...(q.extra[d.k] || [])].filter((o, i, a) => a.indexOf(o) === i).map((o) => (
                              <button key={o} onClick={() => tocar(d, o)} className={chip((q.sel[d.k] || []).includes(o))}>{o}</button>
                            ))}
                            <EntradaCorta placeholder="Otro…" onAgregar={(v) => otraOpcion(d, v)} />
                          </div>
                        )}
                      </div>
                    ))}

                    <div>
                      <p className="mb-2 text-sm font-bold text-tinta">Características <small className="font-normal text-gris">· lo que hace especial a tu producto</small></p>
                      <div className="flex flex-wrap gap-2">
                        {[...new Set([...(CARACTERISTICAS[t.id] ?? []), ...q.featsPropias])].map((f) => (
                          <button key={f} onClick={() => tocarFeat(f)} className={chip(q.feats.includes(f))}>{f}</button>
                        ))}
                        <EntradaCorta ancho placeholder="Escribe otra, ej. Bordado a mano" onAgregar={otraFeat} />
                      </div>
                    </div>

                    {q.tipo === "otro" && q.borrador?.n.trim() && (
                      <button onClick={guardarTipo} className="inline-flex items-center gap-1.5 text-sm font-semibold text-pino underline underline-offset-2">
                        <Star className="size-4" /> Guardar “{q.borrador.n.trim()}” en mis tipos para la próxima vez
                      </button>
                    )}
                  </div>
                </div>
              </Paso>

              {/* 3. Nombre y precio */}
              <Paso n={3} titulo="Nombre y precio" texto="El nombre y la descripción se escriben solos. Puedes cambiarlos.">
                <label className="mb-1.5 block text-sm font-bold text-tinta">Nombre</label>
                <input value={q.nombre} onChange={(e) => setQ((s) => ({ ...s, nombre: e.target.value, nombreTocado: true }))} placeholder="Ej. Polo de algodón" className="mb-4 w-full rounded-xl bg-white px-4 py-3 text-[15px] outline-none ring-1 ring-linea focus:ring-pino" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-tinta">Precio</label>
                    <div className="flex items-center rounded-xl bg-white px-4 ring-1 ring-linea focus-within:ring-pino">
                      <span className="font-semibold text-gris">S/</span>
                      <input inputMode="decimal" value={q.precio} onChange={(e) => setQ((s) => ({ ...s, precio: e.target.value.replace(",", ".") }))} className="w-full bg-transparent px-2 py-3 text-lg font-semibold outline-none" aria-label="Precio" />
                    </div>
                    {t.prices.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {t.prices.map((p) => <button key={p} onClick={() => setQ((s) => ({ ...s, precio: String(p) }))} className={chip(Number(q.precio) === p)}>S/ {p}</button>)}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-bold text-tinta">¿Cuántos tienes?</label>
                    <div className="flex items-center overflow-hidden rounded-xl bg-white ring-1 ring-linea">
                      <button onClick={() => setQ((s) => ({ ...s, stock: Math.max(0, s.stock - 1) }))} className="grid h-12 w-12 place-items-center bg-arena/60 text-tinta" aria-label="Menos"><Minus className="size-4" /></button>
                      <input inputMode="numeric" value={q.stock} onChange={(e) => setQ((s) => ({ ...s, stock: Math.max(0, parseInt(e.target.value.replace(/\D/g, "") || "0", 10)) }))} className="w-full bg-transparent text-center text-lg font-semibold outline-none" aria-label="Stock" />
                      <button onClick={() => setQ((s) => ({ ...s, stock: s.stock + 1 }))} className="grid h-12 w-12 place-items-center bg-arena/60 text-tinta" aria-label="Más"><Plus className="size-4" /></button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[5, 10, 20, 50].map((n) => <button key={n} onClick={() => setQ((s) => ({ ...s, stock: n }))} className={chip(q.stock === n)}>{n}</button>)}
                    </div>
                  </div>
                </div>
                <details className="mt-4">
                  <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-tinta"><Pencil className="size-3.5" /> Ver o cambiar la descripción</summary>
                  <textarea value={q.desc} onChange={(e) => setQ((s) => ({ ...s, desc: e.target.value, descTocada: true }))} rows={4} className="mt-3 w-full rounded-xl bg-white px-4 py-3 text-sm outline-none ring-1 ring-linea focus:ring-pino" />
                </details>
              </Paso>

              {/* 4. Detalles del producto */}
              <Paso n={4} titulo="Detalles del producto" texto="Opcional. Solo si tu producto lo necesita.">
                <FichaTecnica
                  tipo={q.tipo === "otro" ? "otro" : t.id}
                  ficha={q.ficha}
                  on={q.fichaOn}
                  abierto={abrirPegar}
                  setAbierto={setAbrirPegar}
                  cambiar={(ficha, on) => setQ((s) => ({ ...s, ficha, fichaOn: on }))}
                  avisar={avisar}
                />
                {errores && <p className="mt-4 rounded-xl bg-error-claro px-4 py-2.5 text-sm font-semibold text-error">{errores}</p>}
                <button onClick={publicar} disabled={guardando} className="mt-5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-coral font-bold text-white transition hover:brightness-95 disabled:opacity-60">
                  {guardando ? <Loader2 className="size-5 animate-spin" /> : producto ? <Check className="size-5" /> : <Zap className="size-5" />} {producto ? "Guardar cambios" : "Publicar ahora"}
                </button>
              </Paso>
            </>
          )}
        </div>

        {/* Vista en vivo */}
        <aside className="lg:sticky lg:top-24">
          <div className="rounded-[22px] bg-white p-4 shadow-suave ring-1 ring-linea/60">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-coral">Así lo verán tus clientes</p>
            <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl bg-arena/60 text-gris">
              {fotos[0] ? <img src={fotos[0].url} alt="" className="size-full object-cover" /> : <Imagen className="size-9" />}
            </div>
            <b className="mt-3 block text-tinta">{q.nombre || "Tu producto"}</b>
            <span className="font-display text-xl font-extrabold text-tinta">{soles(Math.round((Number(q.precio) || 0) * 100))}</span>
            {coloresSel.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {coloresSel.map((n) => <i key={n} title={n} className="size-5 rounded-full ring-1 ring-black/10" style={{ background: hexDe(n, q.coloresPropios) }} />)}
              </div>
            )}
            {grupos.map((g) => (
              <div key={g.label} className="mt-2 flex flex-wrap gap-1.5">
                {g.opts.map((o) => <span key={o} className="rounded-md bg-arena px-2 py-0.5 text-xs font-semibold text-tinta">{o}</span>)}
              </div>
            ))}
            {ficha.length > 0 && (
              <dl className="mt-3 border-t border-linea pt-3 text-xs">
                {ficha.map(([k, v]) => (
                  <div key={k} className="flex gap-3 py-0.5"><dt className="w-20 shrink-0 text-gris">{k}</dt><dd className="font-semibold text-tinta">{v}</dd></div>
                ))}
              </dl>
            )}
          </div>
          <p className="mt-2.5 flex gap-1.5 px-1 text-xs text-gris"><Info className="mt-0.5 size-3.5 shrink-0" /> Así de rápido: elegir, tocar y publicar. Lo demás lo completas cuando quieras.</p>
        </aside>
      </div>
    </>
  );
}

/* ---------- Piezas ---------- */
const chip = (on: boolean) => `inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition ${on ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea hover:bg-arena/50"}`;
const chipAgregar = "inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-coral ring-1 ring-coral/25 hover:bg-coral-claro";
const btn = (v: "primario" | "fantasma") =>
  `inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition ${v === "primario" ? "bg-pino text-white hover:bg-pino-2" : "bg-white text-tinta ring-1 ring-linea hover:bg-arena/50"}`;

function Cabecera({ titulo, texto, migas, children }: { titulo: string; texto: string; migas: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5">
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/productos" className="hover:text-tinta">Productos</Link> <span>›</span> <span>{migas}</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
          <h1 className="text-[32px] font-extrabold leading-tight text-pino">{titulo}</h1>
          <p className="mt-1 text-sm text-gris">{texto}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function Paso({ n, titulo, texto, children }: { n: number; titulo: string; texto: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60 sm:p-6">
      <div className="mb-4 flex gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pino text-sm font-bold text-white">{n}</span>
        <div>
          <b className="block text-[17px] text-tinta">{titulo}</b>
          <small className="text-sm text-gris">{texto}</small>
        </div>
      </div>
      {children}
    </section>
  );
}

function TipoBoton({ t, on, otro, onClick }: { t: TipoProducto; on: boolean; otro?: boolean; onClick: () => void }) {
  const I = otro ? Plus : t.mine ? Star : ICONO_TIPO[t.id] ?? Gem;
  return (
    <button onClick={onClick} className={`flex w-[104px] flex-col items-center gap-2 rounded-2xl bg-white p-2 pb-3 ring-1 transition ${on ? "ring-2 ring-pino" : "ring-linea hover:ring-pino/40"}`}>
      <span className={`grid h-[78px] w-full place-items-center rounded-xl ${on && !otro ? "bg-pino text-white" : otro ? "border border-dashed border-linea text-tinta" : "bg-coral-claro text-tinta"}`}>
        <I className="size-6" />
      </span>
      <b className="line-clamp-2 text-center text-[13px] leading-tight text-tinta">{t.n}</b>
      {t.mine && <em className="text-[10px] font-bold not-italic text-coral">Tuyo</em>}
    </button>
  );
}

function Fotos({ fotos, subiendo, onAgregar, onQuitar }: { fotos: { key: string; url: string }[]; subiendo: boolean; onAgregar: (f: FileList | null) => void; onQuitar: (i: number) => void }) {
  return (
    <div className="w-full shrink-0 sm:w-[150px]">
      {fotos.length === 0 ? (
        <label className="grid aspect-square cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-coral/50 bg-coral-claro/40 p-3 text-center text-coral">
          <span>
            {subiendo ? <Loader2 className="mx-auto size-7 animate-spin" /> : <Camera className="mx-auto size-7" />}
            <b className="mt-2 block text-sm">Tomar foto</b>
            <small className="text-xs text-gris">o elegir de tu galería</small>
          </span>
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onAgregar(e.target.files)} />
        </label>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
          {fotos.map((f, i) => (
            <div key={f.key} className={`relative overflow-hidden rounded-xl bg-arena ${i === 0 ? "col-span-3 aspect-square sm:col-span-2" : "aspect-square"}`}>
              <img src={f.url} alt="" className="size-full object-cover" />
              <button onClick={() => onQuitar(i)} className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-tinta/70 text-white" aria-label="Quitar foto"><X className="size-3.5" /></button>
            </div>
          ))}
          {fotos.length < 6 && (
            <label className="grid aspect-square cursor-pointer place-items-center rounded-xl border-2 border-dashed border-linea text-gris hover:border-pino/40">
              {subiendo ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onAgregar(e.target.files)} />
            </label>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-gris">Hasta 6 fotos. La primera es la principal.</p>
    </div>
  );
}

function EntradaCorta({ placeholder, onAgregar, ancho }: { placeholder: string; onAgregar: (v: string) => void; ancho?: boolean }) {
  const [v, setV] = useState("");
  const enviar = () => {
    if (!v.trim()) return;
    onAgregar(v);
    setV("");
  };
  return (
    <span className={`inline-flex items-center overflow-hidden rounded-full border border-dashed border-linea bg-white ${ancho ? "w-64" : "w-36"}`}>
      <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), enviar())} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent px-3.5 py-2 text-sm outline-none" />
      <button onClick={enviar} className="grid h-9 w-9 place-items-center bg-coral-claro text-coral" aria-label="Agregar"><Plus className="size-4" /></button>
    </span>
  );
}

function NuevoColor({ onAgregar }: { onAgregar: (n: string, hex: string) => void }) {
  const [n, setN] = useState("");
  const [hex, setHex] = useState("#B5651D");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-arena/50 p-2.5">
      <input type="color" value={hex} onChange={(e) => setHex(e.target.value)} className="size-10 cursor-pointer rounded-lg" aria-label="Elige el color" />
      <input value={n} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onAgregar(n, hex)} placeholder="Nombre del color, ej. Terracota" className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 text-sm outline-none ring-1 ring-linea" />
      <button onClick={() => onAgregar(n, hex)} className={btn("primario")}>Agregar</button>
    </div>
  );
}

function FichaTecnica({ tipo, ficha, on, abierto, setAbierto, cambiar, avisar }: {
  tipo: string; ficha: Record<string, string>; on: string[]; abierto: boolean; setAbierto: (v: boolean) => void;
  cambiar: (ficha: Record<string, string>, on: string[]) => void; avisar: (t: string, tono?: "ok" | "error") => void;
}) {
  const [pegado, setPegado] = useState("");
  const activos = [...new Set([...on, ...Object.keys(ficha).filter((k) => ficha[k]?.trim())])];
  const sugeridos = (DATOS_FICHA[tipo] ?? DATOS_FICHA.otro).filter((f) => !activos.includes(f));
  const activar = (k: string) => cambiar(ficha, [...new Set([...on, k])]);
  const quitar = (k: string) => {
    const f = { ...ficha };
    delete f[k];
    cambiar(f, on.filter((x) => x !== k));
  };
  function ordenar() {
    const filas = leerFicha(pegado);
    if (!filas.length) return avisar('No encontramos datos. Pega una línea por dato, por ejemplo "Batería: 20 h"', "error");
    const f = { ...ficha };
    filas.forEach(([k, v]) => (f[k.charAt(0).toUpperCase() + k.slice(1)] = v));
    cambiar(f, [...new Set([...on, ...Object.keys(f)])]);
    setPegado("");
    setAbierto(false);
    avisar(`Listo: ${filas.length} datos completados`);
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => setAbierto(!abierto)} className={chipAgregar}><Copy className="size-3.5" /> Pegar ficha que ya tengo</button>
        <span className="text-sm text-gris">Se ordena sola. Lo que no pongas no aparece.</span>
      </div>
      {abierto && (
        <div className="mt-3 rounded-2xl bg-coral-claro/60 p-3">
          <textarea value={pegado} onChange={(e) => setPegado(e.target.value)} rows={4} placeholder={"Pega aquí la ficha (de tu proveedor, catálogo o WhatsApp). Ejemplo:\nBatería: 20 h\nGarantía: 3 meses"} className="w-full rounded-xl bg-white px-4 py-3 text-sm outline-none ring-1 ring-linea" />
          <button onClick={ordenar} className={`${btn("primario")} mt-2`}><Zap className="size-4" /> Ordenar la ficha</button>
        </div>
      )}
      {activos.length > 0 && (
        <div className="mt-3 space-y-2">
          {activos.map((k) => (
            <div key={k} className="flex items-center gap-3 rounded-xl bg-arena/40 px-3 py-2">
              <span className="w-28 shrink-0 text-sm font-semibold text-tinta">{k}</span>
              <input value={ficha[k] ?? ""} onChange={(e) => cambiar({ ...ficha, [k]: e.target.value }, on.includes(k) ? on : [...on, k])} placeholder="Escribe el dato" className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 text-sm outline-none ring-1 ring-linea focus:ring-pino" />
              <button onClick={() => quitar(k)} className="grid size-6 place-items-center rounded-full bg-error-claro text-error" aria-label={`Quitar ${k}`}><X className="size-3" /></button>
            </div>
          ))}
        </div>
      )}
      <p className="mb-2 mt-4 text-sm font-bold text-tinta">{activos.length ? "Agregar otro dato" : "O agrega solo los datos que tu producto necesite"}</p>
      <div className="flex flex-wrap gap-2">
        {sugeridos.map((f) => <button key={f} onClick={() => activar(f)} className={chipAgregar}><Plus className="size-3.5" /> {f}</button>)}
        <EntradaCorta placeholder="Otro dato…" onAgregar={(v) => activar(v.charAt(0).toUpperCase() + v.slice(1))} />
      </div>
    </div>
  );
}
