"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronRight, Pencil } from "lucide-react";
import { useApi } from "@/lib/api";
import type { Producto, Tienda } from "@/lib/tipos";
import { Aviso, Boton, Cargando, Encabezado } from "@/components/ui";
import { VistaCliente } from "@/components/tienda/vista-cliente";

// Vista previa de un producto: el vendedor lo ve como lo ve un comprador.
export default function VistaProducto() {
  const { id } = useParams<{ id: string }>();
  const tienda = useApi<Tienda>("/vendedor/tienda");
  const producto = useApi<Producto>(`/vendedor/productos/${id}`);
  if (!tienda.datos || !producto.datos) return <Cargando />;
  const p = producto.datos;

  return (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/productos" className="hover:text-tinta">Productos</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-tinta">Vista previa</span>
      </nav>
      <Encabezado titulo="Así verá tu producto un comprador">
        <Link href={`/vendedor/productos/${p.id}`}>
          <Boton><Pencil className="size-4" /> Editar</Boton>
        </Link>
      </Encabezado>
      {p.activo ? (
        <VistaCliente src={`/t/${tienda.datos.slug}/p/${p.id}?vista=1`} />
      ) : (
        <Aviso tono="aviso">Este producto está oculto. Publícalo para que tus clientes puedan verlo.</Aviso>
      )}
    </div>
  );
}
