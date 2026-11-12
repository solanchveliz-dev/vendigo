"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usuarioActual } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { iniciales } from "@/components/comprador/ui";

// En las páginas públicas: "Ingresar" o el acceso a la cuenta de quien ya tiene sesión.
export function CuentaPublica() {
  const [u, setU] = useState<Usuario | null | undefined>(undefined);
  useEffect(() => {
    usuarioActual().then(setU);
  }, []);
  if (u === undefined) return null;
  if (!u)
    return (
      <Link href="/ingresar?siguiente=/mi-cuenta" className="rounded-full px-3 py-2.5 text-sm font-bold text-pino hover:bg-pino-claro">
        Ingresar
      </Link>
    );
  const destino = u.rol === "admin" ? "/admin" : "/mi-cuenta";
  return (
    <Link href={destino} className="flex items-center gap-2 rounded-full border border-linea bg-white py-1 pl-1 pr-3" title="Mi cuenta">
      <span className="grid size-8 place-items-center rounded-full bg-pino text-xs font-bold text-white">{iniciales(u.nombre)}</span>
      <b className="hidden text-sm text-tinta sm:block">{u.rol === "admin" ? "Panel" : "Mi cuenta"}</b>
    </Link>
  );
}
