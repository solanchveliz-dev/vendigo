"use client";

import { BotonSeguir } from "./seguir";
import { useQuienMira } from "./cuenta-publica";

// "Seguir" de la página de la tienda. La dueña no puede seguir su propia tienda: a ella no le aparece.
export function SeguirTienda({ tiendaId }: { tiendaId: string }) {
  const u = useQuienMira();
  if (u === undefined || (u && u.tienda_id === tiendaId)) return null;
  return (
    <BotonSeguir
      tiendaId={tiendaId}
      conTexto
      clase="inline-flex h-11 items-center gap-2 rounded-full bg-pino px-5 text-sm font-bold text-white ring-1 ring-pino transition hover:bg-pino-2"
    />
  );
}
