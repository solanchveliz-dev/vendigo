"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { CalendarDays, ChevronRight, MessageCircleQuestion, Package, Receipt, ShoppingBag, Wallet } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { FRECUENCIAS, celularBonito, type Cliente } from "@/lib/clientes";
import type { Ayuda } from "@/lib/tipos";
import { EstadoPedido } from "@/components/pedidos/estado";
import { Boton, Cargando, Insignia, cn, useAvisar } from "@/components/ui";

type Compra = {
  id: string;
  codigo: string;
  entrega: string;
  estado: string;
  estado_texto: string;
  total_centimos: number;
  creado_en: string;
  producto: string;
  imagen_url: string;
  items: number;
};
type Detalle = { cliente: Cliente; correo: string; nota: string; compras: Compra[]; ayudas: Ayuda[] };

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Indicador({ titulo, valor, icono, oscuro }: { titulo: string; valor: string; icono: React.ReactNode; oscuro?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded-[22px] p-5 shadow-suave ring-1", oscuro ? "bg-pino text-white ring-pino" : "bg-white ring-linea/60")}>
      <div className="flex items-start justify-between">
        <p className={cn("text-sm", oscuro ? "text-white/80" : "text-gris")}>{titulo}</p>
        <span className={cn("grid size-9 place-items-center rounded-xl", oscuro ? "bg-white/10 text-coral" : "bg-crema text-tinta")}>{icono}</span>
      </div>
      <p className="mt-3 font-display text-3xl font-extrabold">{valor}</p>
      {oscuro && <div className="absolute -bottom-10 -right-6 size-24 rounded-full bg-white/10" />}
    </div>
  );
}

// Ficha de un cliente: sus compras, si pidió ayuda, cómo contactarlo y una nota que solo ve la tienda.
export default function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: d, error } = useApi<Detalle>(`/vendedor/clientes/${id}`);
  const avisar = useAvisar();
  const [nota, setNota] = useState("");
  const [guardada, setGuardada] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (d) {
      setNota(d.nota);
      setGuardada(d.nota);
    }
  }, [d]);

  if (error && !d) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gris">No encontramos a este cliente.</p>
        <Link href="/vendedor/clientes" className="text-sm font-semibold text-pino underline">Volver a Clientes</Link>
      </div>
    );
  }
  if (!d) return <Cargando />;
  const c = d.cliente;
  const f = FRECUENCIAS[c.frecuencia];
  const ticket = c.pedidos ? Math.round(c.total_centimos / c.pedidos) : 0;

  async function guardar() {
    setGuardando(true);
    try {
      await api.put(`/vendedor/clientes/${id}/nota`, { nota });
      setGuardada(nota.trim());
      avisar("Nota guardada. Solo tú la ves.");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/clientes" className="hover:text-pino">Clientes</Link> <ChevronRight className="size-3.5" /> {c.nombre}
      </p>
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">{c.nombre}</h1>
        <p className="text-sm text-gris">
          {c.lugar ? `${c.lugar} · ` : ""}Cliente {f.texto.toLowerCase()}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Pedidos" valor={String(c.pedidos)} icono={<ShoppingBag className="size-[18px]" />} oscuro />
        <Indicador titulo="Total comprado" valor={soles(c.total_centimos)} icono={<Wallet className="size-[18px]" />} />
        <Indicador titulo="Ticket promedio" valor={soles(ticket)} icono={<Receipt className="size-[18px]" />} />
        <Indicador titulo="Última compra" valor={fechaCorta(c.ultima_compra)} icono={<CalendarDays className="size-[18px]" />} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
            <h3 className="mb-2 text-lg font-extrabold text-tinta">Historial de compras</h3>
            {d.compras.map((p) => {
              const fecha = new Date(p.creado_en);
              return (
                <Link key={p.id} href={`/vendedor/pedidos/${p.id}`} className="flex items-center gap-3 border-b border-linea py-3 last:border-0 hover:bg-crema/40">
                  <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-crema text-tinta">
                    {p.imagen_url ? <img src={p.imagen_url} alt="" className="size-full object-cover" /> : <Package className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-tinta">{p.codigo}</b>
                    <span className="block truncate text-xs text-gris">
                      {p.producto}{p.items > 1 ? ` y ${p.items - 1} más` : ""} · {fechaCorta(p.creado_en)} · {fecha.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </span>
                  </span>
                  <span className="hidden sm:block"><EstadoPedido estado={p.estado} texto={p.estado_texto} /></span>
                  <b className="w-24 text-right text-tinta">{soles(p.total_centimos)}</b>
                </Link>
              );
            })}
          </section>

          <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-tinta">Ayuda con sus pedidos</h3>
              <Link href="/vendedor/consultas?tab=ayuda" className="text-sm font-semibold text-tinta hover:text-pino">Consultas</Link>
            </div>
            {!d.ayudas.length ? (
              <p className="text-sm text-gris">No ha pedido ayuda con ningún pedido.</p>
            ) : (
              d.ayudas.map((a) => (
                <Link key={a.id} href={`/vendedor/pedidos/${a.pedido_id}`} className="flex items-center gap-3 border-b border-linea py-3 last:border-0 hover:bg-crema/40">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><MessageCircleQuestion className="size-[18px]" /></span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-tinta">{a.motivo}</b>
                    <span className="block truncate text-xs text-gris">{a.codigo} · {a.mensajes[a.mensajes.length - 1]?.texto}</span>
                  </span>
                  <Insignia tono={a.abierta ? "aviso" : "pino"}>{a.abierta ? "Por responder" : "Resuelta"}</Insignia>
                </Link>
              ))
            )}
          </section>
        </div>

        <div className="space-y-5">
          <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
            <h3 className="mb-3 text-lg font-extrabold text-tinta">Contacto</h3>
            <dl className="grid grid-cols-[90px_1fr] gap-y-2.5 text-sm">
              <dt className="text-gris">Correo</dt>
              <dd className="break-all text-tinta">{d.correo || <span className="text-gris">No lo dejó</span>}</dd>
              <dt className="text-gris">Celular</dt>
              <dd className="text-tinta">
                <a href={`https://wa.me/51${c.celular}`} target="_blank" rel="noreferrer" className="hover:text-pino hover:underline">{celularBonito(c.celular)}</a>
              </dd>
              <dt className="text-gris">Ciudad</dt>
              <dd className="text-tinta">{c.lugar || <span className="text-gris">—</span>}</dd>
            </dl>
          </section>

          <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
            <label htmlFor="nota" className="mb-2 block text-sm font-semibold text-tinta">
              Nota privada <span className="font-normal text-gris">(opcional)</span>
            </label>
            <textarea
              id="nota"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Ej. Prefiere entregas en la tarde"
              className="w-full rounded-xl border border-linea bg-white px-4 py-3 text-sm outline-none focus:border-pino"
            />
            <p className="mb-3 mt-1 text-xs text-gris">Solo tú la ves. Tu cliente no.</p>
            <Boton variante="secundario" tamano="sm" onClick={guardar} cargando={guardando} disabled={nota.trim() === guardada.trim()}>
              Guardar nota
            </Boton>
          </section>
        </div>
      </div>
    </div>
  );
}
