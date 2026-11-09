import Image from "next/image";
import Link from "next/link";
import { PieLegal } from "@/components/legal/pie";

export default function Inicio() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={40} height={40} />
          <span className="font-display text-xl font-extrabold text-pino">VendiGo</span>
        </div>
        <Link href="/ingresar" className="font-semibold text-pino">
          Ingresar
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-16">
        <div className="max-w-2xl">
          <p className="mb-4 inline-block rounded-full bg-coral px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">Hecho para emprendedores</p>
          <h1 className="text-5xl font-extrabold leading-[1.05] text-pino sm:text-6xl">
            Todas tus tiendas en <span className="text-coral">un solo lugar</span>
          </h1>
          <p className="mt-5 text-lg text-gris">Crea tu tienda gratis, recibe pedidos pagados y ordenados, y cobra con pago protegido. Sin comisión por venta.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/registro" className="inline-flex h-12 items-center rounded-full bg-coral px-6 font-semibold text-white">
              Crear mi tienda
            </Link>
            <Link href="/ingresar" className="inline-flex h-12 items-center rounded-full bg-white px-6 font-semibold text-pino ring-1 ring-linea">
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </main>
      <footer className="pb-8"><PieLegal /></footer>
    </div>
  );
}
