"use client";

import { useState } from "react";

// Portada de la tienda. Si la foto es pequeña (menos de 1200 px de ancho) no se estira:
// se muestra completa sobre el color de la tienda para que no se vea borrosa.
export function Portada({ url, nombre }: { url: string; nombre: string }) {
  const [chica, setChica] = useState(false);
  return (
    <div className="relative h-40 overflow-hidden rounded-[24px] bg-pino sm:h-64">
      {url ? (
        <img
          src={url}
          alt={`Portada de ${nombre}`}
          onLoad={(e) => setChica(e.currentTarget.naturalWidth < 1200)}
          className={chica ? "mx-auto h-full w-auto max-w-full object-contain" : "size-full object-cover"}
        />
      ) : (
        <>
          <span className="absolute -right-16 -top-24 size-80 rounded-full bg-white/5" />
          <span className="absolute -bottom-28 left-1/3 size-72 rounded-full bg-coral/15" />
        </>
      )}
    </div>
  );
}

