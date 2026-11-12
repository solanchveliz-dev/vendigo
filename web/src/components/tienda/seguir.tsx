"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { cn } from "@/components/ui";

type Ids = { tiendas: string[]; productos: string[] };
let cache: Promise<Ids | null> | null = null;

// Favoritos del comprador con sesión (null si no tiene sesión de comprador). Los corazones de una misma página
// comparten una sola consulta; al rato se olvida para que después de ingresar o cambiar favoritos esté al día.
function cargarIds(): Promise<Ids | null> {
  if (!cache) {
    cache = fetch("/api/v1/comprador/favoritos/ids", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Ids>) : null))
      .catch(() => null);
    setTimeout(() => (cache = null), 5000);
  }
  return cache;
}

function useFavorito(tipo: "tiendas" | "productos", id: string) {
  const router = useRouter();
  const ruta = usePathname();
  const [activo, setActivo] = useState(false);
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    cargarIds().then((d) => setActivo(!!d?.[tipo].includes(id)));
  }, [tipo, id]);

  async function tocar(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const d = await cargarIds();
    if (!d) {
      // Sin sesión de comprador: se ingresa (o se crea la cuenta) y se vuelve aquí.
      router.push(`/ingresar?siguiente=${encodeURIComponent(ruta)}`);
      return;
    }
    const nuevo = !activo;
    setActivo(nuevo);
    const r = await fetch(`/api/v1/comprador/favoritos/${tipo}/${id}`, { method: nuevo ? "PUT" : "DELETE" }).catch(() => null);
    if (!r?.ok) {
      setActivo(!nuevo);
      return;
    }
    d[tipo] = nuevo ? [...d[tipo], id] : d[tipo].filter((x) => x !== id);
    setAviso(nuevo ? (tipo === "tiendas" ? "Ahora sigues esta tienda" : "Guardado en favoritos") : tipo === "tiendas" ? "Dejaste de seguirla" : "Quitado de favoritos");
    setTimeout(() => setAviso(""), 2000);
  }
  return { activo, aviso, tocar };
}

function Globo({ texto }: { texto: string }) {
  return texto ? (
    <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 rounded-full bg-tinta px-3 py-1.5 text-xs font-semibold text-white shadow-suave">{texto}</span>
  ) : null;
}

// Corazón para seguir la tienda (queda en Favoritos → Emprendedores).
export function BotonSeguir({ clase, tiendaId }: { clase: string; tiendaId: string }) {
  const { activo, aviso, tocar } = useFavorito("tiendas", tiendaId);
  return (
    <div className="relative">
      <button onClick={tocar} className={clase} aria-pressed={activo} aria-label={activo ? "Dejar de seguir" : "Seguir tienda"} title={activo ? "Dejar de seguir" : "Seguir tienda"}>
        <Heart className={cn("size-5", activo && "fill-current")} />
      </button>
      <Globo texto={aviso} />
    </div>
  );
}

// Corazón para guardar un producto (queda en Favoritos → Productos guardados).
export function BotonGuardar({ productoId, clase }: { productoId: string; clase?: string }) {
  const { activo, aviso, tocar } = useFavorito("productos", productoId);
  return (
    <div className="relative">
      <button
        onClick={tocar}
        className={clase ?? cn("grid size-11 place-items-center rounded-full bg-white ring-1 ring-linea transition", activo ? "text-coral" : "text-tinta hover:text-coral")}
        aria-pressed={activo}
        aria-label={activo ? "Quitar de favoritos" : "Guardar en favoritos"}
        title={activo ? "Quitar de favoritos" : "Guardar en favoritos"}
      >
        <Heart className={cn("size-5", activo && "fill-current")} />
      </button>
      <Globo texto={aviso} />
    </div>
  );
}
