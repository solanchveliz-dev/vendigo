"use client";

import Link from "next/link";
import { Pencil, Share2 } from "lucide-react";
import { useApi } from "@/lib/api";
import type { Tienda } from "@/lib/tipos";
import { Boton, Cargando, Encabezado } from "@/components/ui";
import { VistaCliente } from "@/components/tienda/vista-cliente";

// Vista previa de la tienda: el vendedor ve su tienda como la ve un comprador.
export default function VistaTienda() {
  const { datos: t } = useApi<Tienda>("/vendedor/tienda");
  if (!t) return <Cargando />;

  return (
    <div>
      <Encabezado titulo="Así verá tu tienda un comprador" detalle="Esta es una vista previa. Los botones de compra no funcionan aquí.">
        <Link href="/vendedor/tienda">
          <Boton variante="secundario"><Pencil className="size-4" /> Editar tienda</Boton>
        </Link>
        <Link href="/vendedor/tienda/compartir">
          <Boton><Share2 className="size-4" /> Compartir</Boton>
        </Link>
      </Encabezado>
      <VistaCliente src={`/t/${t.slug}?vista=1`} />
    </div>
  );
}
