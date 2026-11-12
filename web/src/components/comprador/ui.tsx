import Link from "next/link";
import { Bike, ChevronRight, Heart, Package, ShoppingBag, Star, Store } from "lucide-react";
import { fecha, soles } from "@/lib/formato";
import { rubros } from "@/lib/catalogos";
import { cn } from "@/components/ui";

export type PedidoComprador = {
  codigo: string;
  token: string;
  tienda: string;
  tienda_slug: string;
  tienda_logo: string;
  estado: string;
  estado_texto: string;
  pago_estado: string;
  pago_texto: string;
  entrega: "recojo" | "agencia" | "motorizado";
  total_centimos: number;
  items: number;
  producto: string;
  imagen_url: string;
  creado_en: string;
  grupo: "curso" | "entregado" | "cancelado";
  valorado: boolean;
};

export const iniciales = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export const ENTREGA = {
  recojo: { t: "Recojo", icono: Store },
  agencia: { t: "Agencia", icono: Package },
  motorizado: { t: "Motorizado", icono: Bike },
} as const;

// Pasos del pedido para la barrita de avance (como el prototipo).
const PASOS = ["por_aceptar", "preparando", "enviado", "entregado"];
function paso(estado: string) {
  if (estado === "listo_recojo") return 2;
  return Math.max(0, PASOS.indexOf(estado));
}

export function Progreso({ estado }: { estado: string }) {
  const i = paso(estado);
  return (
    <div className="flex gap-1.5" aria-label={`Paso ${i + 1} de ${PASOS.length}`}>
      {PASOS.map((_, k) => <span key={k} className={cn("h-1.5 flex-1 rounded-full", k <= i ? "bg-pino" : "bg-linea")} />)}
    </div>
  );
}

// Lo que más le importa al comprador: si hay que pagar, primero eso; si no, en qué va la entrega.
export function EstadoPedido({ p }: { p: PedidoComprador }) {
  const porPagar = p.grupo === "curso" && (p.pago_estado === "pendiente" || p.pago_estado === "no_recibido");
  const tono =
    p.grupo === "cancelado" ? "bg-error-claro text-error" : p.grupo === "entregado" ? "bg-pino-claro text-pino" : porPagar ? "bg-aviso-claro text-aviso" : "bg-[#e6eef7] text-[#2c5d8f]";
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold", tono)}>
      <span className="size-1.5 rounded-full bg-current" />
      {porPagar ? p.pago_texto : p.estado_texto}
    </span>
  );
}

export function Miniatura({ p, className }: { p: PedidoComprador; className?: string }) {
  return p.imagen_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.imagen_url} alt="" className={cn("rounded-xl object-cover ring-1 ring-linea", className)} />
  ) : (
    <span className={cn("grid place-items-center rounded-xl bg-crema text-gris ring-1 ring-linea", className)}><ShoppingBag className="size-5" /></span>
  );
}

// Fila de "Mis pedidos": abre el seguimiento del pedido. Si ya lo recibió y no lo valoró, ofrece valorarlo.
export function FilaPedido({ p }: { p: PedidoComprador }) {
  const valorar = p.grupo === "entregado" && !p.valorado;
  return (
    <div className="overflow-hidden rounded-[22px] bg-white shadow-suave ring-1 ring-linea/60 transition hover:ring-pino/40">
      <Fila p={p} />
      {valorar && (
        <Link href={`/mi-cuenta/valorar/${p.codigo}`} className="flex items-center justify-between gap-3 border-t border-linea bg-aviso-claro/50 px-5 py-3 text-sm">
          <span className="text-tinta">¿Qué tal tu compra? Tu opinión ayuda a otros compradores.</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-bold text-coral"><Star className="size-4 fill-current" /> Valorar</span>
        </Link>
      )}
    </div>
  );
}

function Fila({ p }: { p: PedidoComprador }) {
  const E = ENTREGA[p.entrega] ?? ENTREGA.recojo;
  return (
    <Link href={`/seguimiento/${p.token}`} className="flex items-center gap-4 p-4 sm:p-5">
      <Miniatura p={p} className="size-16 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <b className="text-tinta">{p.tienda}</b>
          <EstadoPedido p={p} />
        </div>
        <p className="text-sm text-gris">
          {p.codigo} · {p.items} {p.items === 1 ? "producto" : "productos"} · {fecha(p.creado_en)}
        </p>
        {p.grupo !== "cancelado" && <div className="max-w-sm"><Progreso estado={p.estado} /></div>}
      </div>
      <div className="hidden shrink-0 text-right sm:block">
        <span className="flex items-center justify-end gap-1.5 text-sm text-gris"><E.icono className="size-4" /> {E.t}</span>
        <b className="mt-1 block font-display text-lg text-tinta">{soles(p.total_centimos)}</b>
      </div>
      <ChevronRight className="size-5 shrink-0 text-gris" />
    </Link>
  );
}

export function Vacio({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-white px-6 py-12 text-center shadow-suave ring-1 ring-linea/60">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-pino-claro text-pino"><ShoppingBag className="size-7" /></span>
      <h2 className="mt-4 text-xl font-extrabold text-tinta">{titulo}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-gris">{texto}</p>
      {children && <div className="mt-5 flex justify-center gap-2">{children}</div>}
    </div>
  );
}

export type Direccion = { id: string; etiqueta: string; direccion: string; distrito: string; ciudad: string; referencia: string; principal: boolean };

export type TiendaFav = { id: string; nombre: string; slug: string; rubro: string; lugar: string; logo_url: string };

// Tarjeta de un emprendedor que sigue (favoritos y Mi inicio).
export function TarjetaTienda({ t, alQuitar }: { t: TiendaFav; alQuitar?: () => void }) {
  return (
    <div className="flex items-center gap-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
      {t.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.logo_url} alt="" className="size-14 shrink-0 rounded-2xl object-cover" />
      ) : (
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-pino-claro text-pino"><Store className="size-6" /></span>
      )}
      <Link href={`/t/${t.slug}`} className="min-w-0 flex-1">
        <b className="block truncate text-tinta">{t.nombre}</b>
        <span className="block truncate text-sm text-gris">{rubros[t.rubro] ?? t.rubro}{t.lugar ? ` · ${t.lugar}` : ""}</span>
      </Link>
      {alQuitar && (
        <button onClick={alQuitar} className="grid size-10 shrink-0 place-items-center rounded-full text-coral ring-1 ring-linea" aria-label="Dejar de seguir" title="Dejar de seguir">
          <Heart className="size-[18px] fill-current" />
        </button>
      )}
    </div>
  );
}
