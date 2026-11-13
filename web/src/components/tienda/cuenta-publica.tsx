"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { usuarioActual } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { iniciales } from "@/components/comprador/ui";

// Quién mira la página pública (null = visitante sin sesión, undefined = todavía cargando).
// Todas las piezas de una misma página comparten una sola consulta.
let pendiente: Promise<Usuario | null> | null = null;
export function useQuienMira() {
  const [u, setU] = useState<Usuario | null | undefined>(undefined);
  useEffect(() => {
    if (!pendiente) {
      pendiente = usuarioActual();
      setTimeout(() => (pendiente = null), 5000);
    }
    pendiente.then(setU);
  }, []);
  return u;
}

const enlace = "rounded-full px-3 py-2.5 text-sm font-bold text-pino hover:bg-pino-claro";
const solido = "hidden rounded-full bg-pino px-5 py-2.5 text-sm font-bold text-white transition hover:bg-pino-2 sm:inline-block";

// Acceso a la cuenta en las páginas públicas, según quién mira:
// visitante → Ingresar (y Crea tu tienda o Crear cuenta), comprador → Mi cuenta,
// vendedora → Mi cuenta e Ir a mi panel, admin → Panel.
export function CuentaPublica({ enTienda = false }: { enTienda?: boolean }) {
  const u = useQuienMira();
  const ruta = usePathname();
  if (u === undefined) return null;
  if (!u)
    return (
      <>
        <Link href={`/ingresar?siguiente=${encodeURIComponent(enTienda ? ruta : "/mi-cuenta")}`} className={enlace}>
          Ingresar
        </Link>
        {enTienda ? (
          <Link href="/registro?tipo=comprar" className={solido}>Crear cuenta</Link>
        ) : (
          <Link href="/registro" className={solido}>Crea tu tienda</Link>
        )}
      </>
    );
  if (u.rol === "admin") return <Avatar u={u} href="/admin" texto="Panel" />;
  return (
    <>
      {u.rol === "vendedor" && (
        <Link href="/vendedor" className={`hidden sm:inline-block ${enlace}`}>Ir a mi panel</Link>
      )}
      <Avatar u={u} href="/mi-cuenta" texto="Mi cuenta" />
    </>
  );
}

function Avatar({ u, href, texto }: { u: Usuario; href: string; texto: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-full border border-linea bg-white py-1 pl-1 pr-3" title={texto}>
      <span className="grid size-8 place-items-center rounded-full bg-pino text-xs font-bold text-white">{iniciales(u.nombre)}</span>
      <b className="hidden text-sm text-tinta sm:block">{texto}</b>
    </Link>
  );
}
