"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, Search, X } from "lucide-react";
import { CuentaPublica, useQuienMira } from "./cuenta-publica";

// Barra de la página de una tienda y de sus productos. El buscador busca solo dentro de esa tienda.
// Si quien mira es la dueña, arriba aparece la franja "Así ven tu tienda tus clientes".
export function CabeceraTienda({ tienda, q = "" }: { tienda: { id: string; slug: string; nombre: string }; q?: string }) {
  const u = useQuienMira();
  const duena = !!u && u.tienda_id === tienda.id;
  return (
    <header className="sticky top-0 z-20 border-b border-linea/70 bg-crema/95 backdrop-blur">
      {duena && (
        <div className="bg-aviso-claro text-aviso">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 text-sm sm:px-6 lg:px-10">
            <span className="flex flex-1 items-center gap-2 font-semibold">
              <Eye className="size-4 shrink-0" /> Así ven tu tienda tus clientes
            </span>
            <Link href="/vendedor/tienda" className="font-bold underline-offset-4 hover:underline">Editar tienda</Link>
            <Link href="/vendedor" className="font-bold underline-offset-4 hover:underline">Ir a mi panel</Link>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Ir al inicio de VendiGo">
          <Image src="/logo.png" alt="" width={34} height={34} className="rounded-full bg-white" />
          <span className="hidden font-display text-lg font-extrabold text-pino sm:inline">
            Vendi<span className="text-coral">Go</span>
          </span>
        </Link>
        <form action={`/t/${tienda.slug}`} className="order-last flex w-full items-center gap-2 rounded-full bg-white py-1 pl-4 pr-1 ring-1 ring-linea focus-within:ring-2 focus-within:ring-pino md:order-none md:mx-2 md:w-auto md:max-w-xl md:flex-1">
          <Search className="size-4 shrink-0 text-gris" />
          <input
            name="q"
            defaultValue={q}
            placeholder={`Buscar en ${tienda.nombre}`}
            aria-label={`Buscar productos en ${tienda.nombre}`}
            className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gris"
          />
          {q && (
            <Link href={`/t/${tienda.slug}`} className="grid size-8 place-items-center rounded-full text-gris hover:bg-arena" aria-label="Borrar búsqueda">
              <X className="size-4" />
            </Link>
          )}
          <button className="h-9 rounded-full bg-pino px-4 text-sm font-bold text-white hover:bg-pino-2">Buscar</button>
        </form>
        <div className="ml-auto flex items-center gap-2">
          <CuentaPublica enTienda />
        </div>
      </div>
    </header>
  );
}
