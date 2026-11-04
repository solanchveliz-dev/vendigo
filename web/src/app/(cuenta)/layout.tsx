import Image from "next/image";
import Link from "next/link";

export default function LayoutCuenta({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-pino p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={44} height={44} className="rounded-xl bg-crema p-1" />
          <span className="font-display text-2xl font-extrabold">VendiGo</span>
        </Link>
        <div className="max-w-md">
          <p className="font-display text-5xl font-extrabold leading-[1.05]">
            Haz crecer <span className="text-coral">lo que haces</span>
          </p>
          <p className="mt-5 text-lg text-white/75">Tus pedidos llegan pagados y ordenados. Tú solo atiendes lo que te toca.</p>
          <ul className="mt-8 space-y-3 text-white/85">
            <li>✓ Pago protegido: tus clientes pagan con Yape o tarjeta dentro de VendiGo</li>
            <li>✓ Sin comisión por venta: eliges un plan con cupo de ventas</li>
            <li>✓ Publica un producto con solo una foto</li>
          </ul>
        </div>
        <p className="text-sm text-white/50">Todas tus tiendas en un solo lugar</p>
        <div className="absolute -right-24 -top-24 size-80 rounded-full bg-coral/20" />
        <div className="absolute -bottom-32 right-10 size-96 rounded-full bg-white/5" />
      </aside>
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <Image src="/logo.png" alt="" width={36} height={36} />
            <span className="font-display text-xl font-extrabold text-pino">VendiGo</span>
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}
