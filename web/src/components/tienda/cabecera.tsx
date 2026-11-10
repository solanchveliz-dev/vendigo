import Image from "next/image";
import Link from "next/link";
import { Search, ShieldCheck } from "lucide-react";

// Barra superior de las páginas públicas (tienda y producto).
export function CabeceraPublica({ q = "" }: { q?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-linea/70 bg-crema/90 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="" width={40} height={40} className="rounded-full bg-white" />
          <span className="font-display text-xl font-extrabold text-pino">
            Vendi<span className="text-coral">Go</span>
          </span>
        </Link>
        <form action="/buscar" className="mx-4 hidden max-w-xl flex-1 items-center gap-2 rounded-full bg-white py-1 pl-4 pr-1 ring-1 ring-linea md:flex">
          <Search className="size-4 shrink-0 text-gris" />
          <input name="q" defaultValue={q} placeholder="¿Qué buscas? Ej. aretes, alfajores, polos" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gris" />
          <button className="h-9 rounded-full bg-coral px-4 text-sm font-bold text-white hover:brightness-95">Buscar</button>
        </form>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 text-sm font-semibold text-ok sm:inline-flex">
            <ShieldCheck className="size-4" /> Pedido con seguimiento
          </span>
          <Link href="/registro" className="rounded-full bg-pino px-5 py-2.5 text-sm font-bold text-white transition hover:bg-pino-2">
            Crea tu tienda
          </Link>
        </div>
      </div>
    </header>
  );
}
