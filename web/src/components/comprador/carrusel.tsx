"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MapPin, Play, Search } from "lucide-react";
import { Modal, cn } from "@/components/ui";


// Banner principal del inicio (hero) en carrusel:
// 1) saludo y buscador;
// 2–4) campañas por rubro (hogar, regalos, tecnología) con su foto y su botón.
export function CarruselInicio({ saludo, fotosRubro = {} }: { saludo: string; fotosRubro?: Record<string, string> }) {
  const router = useRouter();
  function buscar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    const texto = f.get("q")?.toString().trim();
    const ciudad = f.get("ciudad")?.toString().trim();
    if (texto) q.set("q", texto);
    if (ciudad) q.set("ciudad", ciudad);
    router.push(`/buscar?${q}`);
  }
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
        {/* 1. Mensaje principal: saludo y buscador */}
        <div className="relative flex min-h-[380px] w-full shrink-0 items-center overflow-hidden bg-pino px-6 py-8 text-white md:px-14" aria-hidden={i !== 0}>
          {/* Anillos de fondo del prototipo (.hm-hero::before) */}
          <span className="pointer-events-none absolute -right-[120px] -top-[220px] size-[560px] rounded-full border border-white/[0.12] shadow-[0_0_0_70px_rgba(255,255,255,0.035),0_0_0_140px_rgba(255,255,255,0.02)]" />
          <span className="pointer-events-none absolute -bottom-[160px] right-[18%] hidden size-[300px] rounded-full bg-coral/90 lg:block" />
          <div className="relative">
            <span className="inline-block rounded-full bg-coral px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.1em]">{saludo}</span>
            <h1 className="mt-4 font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.04em] md:text-[48px]">
              Descubre tu próxima tienda <i className="font-serif font-semibold text-coral">favorita</i>
            </h1>
            <p className="mt-3 max-w-[460px] text-[16px] leading-relaxed text-white/80">Encuentra productos únicos de emprendedores peruanos y compra directamente en sus tiendas.</p>
            <form onSubmit={buscar} role="search" className="mt-6 flex max-w-[560px] flex-col gap-1.5 rounded-[22px] bg-white p-1.5 text-tinta sm:flex-row sm:items-center sm:rounded-full">
              <label className="flex min-w-0 flex-[1.3] items-center gap-2 px-3.5">
                <Search className="size-5 shrink-0 text-gris" />
                <input name="q" aria-label="Qué buscas" tabIndex={i === 0 ? 0 : -1} placeholder="¿Qué buscas?" className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-gris" />
              </label>
              <label className="flex min-w-0 flex-1 items-center gap-2 border-linea px-3.5 sm:border-l">
                <MapPin className="size-5 shrink-0 text-gris" />
                <input name="ciudad" aria-label="Ciudad" tabIndex={i === 0 ? 0 : -1} placeholder="¿Dónde? Ej. Lima" className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-gris" />
              </label>
              <button tabIndex={i === 0 ? 0 : -1} className="h-11 rounded-full bg-coral px-6 font-bold text-white transition hover:brightness-95">Buscar</button>
            </form>
            <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[13px] text-white/75">
              <span>Lo más buscado:</span>
              {["Alfajores", "Joyería", "Polos", "Skincare", "Velas"].map((b) => (
                <Link key={b} href={`/buscar?q=${encodeURIComponent(b.toLowerCase())}`} tabIndex={i === 0 ? 0 : -1} className="rounded-full bg-white/10 px-3 py-1.5 font-semibold text-white ring-1 ring-white/25 transition hover:bg-white hover:text-pino">{b}</Link>
              ))}
            </div>
            <button type="button" onClick={() => setComo(true)} tabIndex={i === 0 ? 0 : -1} className="mt-4 inline-flex items-center gap-2 text-[14px] font-bold text-white/90 hover:underline">
              <Play className="size-3.5 fill-current" /> Cómo funciona VendiGo
            </button>
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
