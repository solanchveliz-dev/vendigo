"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Play, ShieldCheck, Store, Truck } from "lucide-react";
import { soles } from "@/lib/formato";
import { Modal, cn } from "@/components/ui";

export type FotoCarrusel = { id: string; url: string; nombre: string; precio: number; slug: string };

// Banner principal del inicio (hero) en carrusel:
// 1) el mensaje de VendiGo con productos reales de las tiendas sobre pedestales;
// 2–4) campañas por rubro (hogar, regalos, tecnología) con su foto y su botón.
export function CarruselInicio({ productos, fotosRubro = {} }: { productos: FotoCarrusel[]; fotosRubro?: Record<string, string> }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const [como, setComo] = useState(false);
  const total = 4;
  const ir = useCallback((n: number) => setI(((n % total) + total) % total), []);
  const quieto = useRef(false);

  useEffect(() => {
    quieto.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  useEffect(() => {
    if (pausa || quieto.current) return;
    const t = setInterval(() => setI((x) => (x + 1) % total), 7000);
    return () => clearInterval(t);
  }, [pausa]);

  const foto = (rubro: string, respaldo: string) => fotosRubro[rubro] || respaldo;
  const campanas = [
    { titulo: "Ideas únicas para tu día a día", texto: "Velas, cerámica y textiles hechos por emprendedores para tu casa.", boton: "Explorar hogar", href: "/buscar?rubro=hogar", img: foto("hogar", "/inicio/vela.jpg"), fondo: "bg-[#e8efe9]", acento: "text-pino" },
    { titulo: "Regalos especiales para cada ocasión", texto: "Accesorios y artesanías con detalles que no encuentras en otro lado.", boton: "Ver regalos", href: "/buscar?rubro=accesorios", img: foto("accesorios", "/inicio/aretes.jpg"), fondo: "bg-[#fbe9e3]", acento: "text-[#a8402b]" },
    { titulo: "Tecnología y más", texto: "Accesorios y gadgets de emprendedores de todo el Perú.", boton: "Explorar tecnología", href: "/buscar?rubro=tecnologia", img: foto("tecnologia", "/inicio/smartwatch.jpg"), fondo: "bg-[#e6eef6]", acento: "text-[#21476b]" },
  ];
  const pedestales = productos.slice(0, 3);

  return (
    <section
      className="relative overflow-hidden rounded-[28px]"
      aria-roledescription="carrusel"
      aria-label="Novedades de VendiGo"
      onMouseEnter={() => setPausa(true)}
      onMouseLeave={() => setPausa(false)}
      onFocus={() => setPausa(true)}
      onBlur={() => setPausa(false)}
    >
      <div className="flex transition-transform duration-700 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${i * 100}%)` }}>
        {/* 1. Mensaje principal */}
        <div className="relative grid min-h-[380px] w-full shrink-0 items-center gap-6 overflow-hidden bg-pino px-6 py-8 text-white md:px-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" aria-hidden={i !== 0}>
          <span className="pointer-events-none absolute -right-24 bottom-[-140px] hidden size-[460px] rounded-full bg-coral lg:block" />
          <span className="pointer-events-none absolute -left-20 -top-28 size-[300px] rounded-full bg-pino-2/70" />
          <div className="relative">
            <span className="flex items-center gap-2">
              <Image src="/logo.png" alt="" width={34} height={34} />
              <b className="font-display text-[20px] font-extrabold">Vendi<span className="text-coral">Go</span></b>
            </span>
            <h1 className="mt-4 font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.04em] md:text-[50px]">
              Descubre productos de <span className="text-coral">emprendedores</span>
            </h1>
            <p className="mt-3 max-w-[480px] text-[16px] leading-relaxed text-white/80">Explora tiendas independientes, encuentra artículos únicos y compra de forma directa y segura.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/buscar" tabIndex={i === 0 ? 0 : -1} className="inline-flex h-12 items-center gap-2 rounded-full bg-coral px-6 font-bold text-white transition hover:brightness-95">
                <Store className="size-5" /> Explorar tiendas
              </Link>
              <button type="button" onClick={() => setComo(true)} tabIndex={i === 0 ? 0 : -1} className="inline-flex h-12 items-center gap-2 rounded-full px-6 font-bold text-white ring-2 ring-white/70 transition hover:bg-white/10">
                <Play className="size-4 fill-current" /> Cómo funciona
              </button>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-7 gap-y-3 text-[13.5px] leading-tight text-white/85">
              <li className="flex items-center gap-2.5"><ShieldCheck className="size-6 shrink-0" /> Tiendas<br />verificadas</li>
              <li className="flex items-center gap-2.5"><Truck className="size-6 shrink-0" /> Envíos<br />a todo el Perú</li>
              <li className="flex items-center gap-2.5"><CreditCard className="size-6 shrink-0" /> Yape, Plin<br />o transferencia</li>
            </ul>
          </div>
          {/* Productos reales sobre pedestales */}
          <div className="relative hidden h-[320px] items-end justify-center gap-4 lg:flex">
            {pedestales.map((p, k) => (
              <Link key={p.id} href={`/t/${p.slug}/p/${p.id}`} tabIndex={i === 0 ? 0 : -1} className={cn("group relative flex flex-col items-center", k === 1 ? "z-10" : "")} title={p.nombre}>
                <span className={cn("casilla-producto block overflow-hidden rounded-[26px] shadow-[0_24px_40px_-24px_rgba(0,0,0,0.6)]", k === 1 ? "size-[210px]" : "size-[150px]")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.nombre} className="foto-producto transition duration-500 group-hover:scale-105" />
                </span>
                <span className={cn("-mt-3 rounded-t-[14px] bg-[#f3f0ea]", k === 1 ? "h-16 w-[170px]" : "h-10 w-[120px]")} />
                <span className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-1 text-[12px] font-bold text-tinta">{soles(p.precio)}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* 2–4. Campañas por rubro */}
        {campanas.map((c, k) => (
          <div key={c.titulo} className={cn("relative grid min-h-[380px] w-full shrink-0 items-center gap-6 overflow-hidden px-6 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:px-14", c.fondo)} aria-hidden={i !== k + 1}>
            <div className="relative">
              <h2 className={cn("max-w-[14ch] font-display text-[34px] font-extrabold leading-[1.04] tracking-[-0.04em] md:text-[46px]", c.acento)}>{c.titulo}</h2>
              <p className="mt-3 max-w-[420px] text-[16px] text-tinta/75">{c.texto}</p>
              <Link href={c.href} tabIndex={i === k + 1 ? 0 : -1} className="mt-6 inline-flex h-12 items-center gap-2 rounded-full bg-pino px-6 font-bold text-white transition hover:bg-pino-2">
                {c.boton} <ChevronRight className="size-4" />
              </Link>
            </div>
            <div className="relative hidden h-[300px] overflow-hidden rounded-[24px] bg-white/60 md:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.img} alt="" className="size-full object-cover" />
            </div>
          </div>
        ))}
      </div>

      {/* Flechas e indicadores */}
      <button type="button" onClick={() => ir(i - 1)} aria-label="Anterior" className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-tinta shadow-suave transition hover:scale-105">
        <ChevronLeft className="size-5" />
      </button>
      <button type="button" onClick={() => ir(i + 1)} aria-label="Siguiente" className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white text-tinta shadow-suave transition hover:scale-105">
        <ChevronRight className="size-5" />
      </button>
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {Array.from({ length: total }, (_, k) => (
          <button
            key={k}
            type="button"
            onClick={() => ir(k)}
            aria-label={`Ir al banner ${k + 1}`}
            aria-current={i === k}
            className={cn("h-2.5 rounded-full transition-all", i === k ? "w-7 bg-coral" : "w-2.5", i === k ? "" : i === 0 ? "bg-white/60" : "bg-tinta/25")}
          />
        ))}
      </div>

      <Modal abierto={como} onCerrar={() => setComo(false)} titulo="Cómo funciona VendiGo">
        <ol className="space-y-4">
          {[
            ["Encuentra una tienda", "Busca por producto, rubro o ciudad. Todas las tiendas tienen la identidad de su dueña verificada."],
            ["Haz tu pedido", "Elige cómo recibirlo: recojo, agencia o motorizado. Confirmas tu celular con un código."],
            ["Paga directo a la tienda", "Con Yape, Plin o transferencia. VendiGo no recibe tu dinero."],
            ["Sigue tu pedido", "Te avisamos en cada paso. Si algo sale mal, abres un reclamo y VendiGo media."],
          ].map(([t, d], n) => (
            <li key={t} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-pino font-bold text-white">{n + 1}</span>
              <span><b className="block text-tinta">{t}</b><span className="text-sm text-gris">{d}</span></span>
            </li>
          ))}
        </ol>
      </Modal>
    </section>
  );
}
