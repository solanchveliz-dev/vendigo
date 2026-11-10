import Link from "next/link";
import { BookOpen } from "lucide-react";

// Enlaces legales que deben verse en las páginas públicas (Indecopi los pide).
export function PieLegal({ className = "" }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-gris ${className}`}>
      <Link href="/terminos" className="hover:text-tinta">Términos y condiciones</Link>
      <Link href="/devoluciones" className="hover:text-tinta">Cambios y devoluciones</Link>
      <Link href="/privacidad" className="hover:text-tinta">Privacidad</Link>
      <Link href="/libro-reclamaciones" className="inline-flex items-center gap-1.5 font-semibold text-tinta hover:text-pino">
        <BookOpen className="size-4" /> Libro de Reclamaciones
      </Link>
    </nav>
  );
}
