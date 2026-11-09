import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, Truck, Wallet } from "lucide-react";

const ventajas = [
  { icono: Wallet, texto: "Pagos con Yape sin capturas" },
  { icono: Truck, texto: "Envíos sin escribir datos" },
  { icono: ShieldCheck, texto: "Compra protegida para tus clientes" },
];

export default function LayoutCuenta({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-crema lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-pino text-white lg:block">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-pino-2" />
        
        <div className="absolute -bottom-40 -left-20 size-[420px] rounded-full bg-white/[0.04]" />
        <div className="relative flex h-full min-h-screen flex-col justify-between p-12">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-[60px] place-items-center rounded-2xl bg-white p-1.5 shadow-suave">
              <Image src="/logo.png" alt="" width={48} height={48} />
            </span>
            <span>
              <span className="block font-display text-[22px] font-extrabold leading-none">
                Vendi<span className="text-[#f2a33a]">Go</span>
              </span>
              <span className="text-xs text-white/70">Haz crecer lo que haces.</span>
            </span>
          </Link>
          <div className="max-w-md">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-coral">VendiGo</p>
            <p className="mt-3 font-display text-[50px] font-extrabold leading-[1.02]">
              Haz crecer <span className="text-coral">lo que haces</span>.
            </p>
            <p className="mt-4 text-[17px] leading-relaxed text-white/80">Tu tienda en línea, pagos con Yape confirmados y pedidos ordenados en un solo lugar.</p>
            <ul className="mt-6 space-y-3">
              {ventajas.map(({ icono: I, texto }) => (
                <li key={texto} className="flex items-center gap-3 font-semibold">
                  <span className="grid size-8 place-items-center rounded-full bg-white/10 text-coral">
                    <I className="size-4" />
                  </span>
                  {texto}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[440px]">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <Image src="/logo.png" alt="" width={36} height={36} />
            <span className="font-display text-xl font-extrabold text-pino">
              Vendi<span className="text-[#f2a33a]">Go</span>
            </span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
