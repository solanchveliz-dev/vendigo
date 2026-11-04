import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Encabezado } from "@/components/ui";
import { FormularioProducto } from "@/components/productos/formulario";

export default function NuevoProducto() {
  return (
    <>
      <Link href="/vendedor/productos" className="inline-flex items-center gap-1 text-sm font-semibold text-pino">
        <ArrowLeft className="size-4" /> Productos
      </Link>
      <Encabezado titulo="Publicar producto" detalle="Empieza por la foto: con ella la IA puede completar el resto." />
      <FormularioProducto />
    </>
  );
}
