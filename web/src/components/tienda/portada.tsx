"use client";

import { useEffect, useRef, useState } from "react";

// Portada de la tienda. Si la foto es pequeña (menos de 1200 px de ancho) no se estira, porque se vería borrosa:
// se muestra completa y nítida al centro, y la misma foto difuminada rellena los costados.
export function Portada({ url, nombre }: { url: string; nombre: string }) {
  const foto = useRef<HTMLImageElement>(null);
  const [chica, setChica] = useState<boolean | null>(null);

  // Si la foto ya estaba guardada en el navegador, carga antes que la página y "onLoad" no llega a avisar:
  // por eso también se mide aquí. Así se ve igual siempre, para la dueña y para quien compra.
  useEffect(() => {
    const img = foto.current;
    if (img?.complete && img.naturalWidth) setChica(img.naturalWidth < 1200);
  }, [url]);

  return (
    <div className="relative h-40 overflow-hidden rounded-[24px] bg-pino sm:h-64">
      {url ? (
        <>
          {chica && <img src={url} alt="" aria-hidden className="absolute inset-0 size-full scale-110 object-cover blur-2xl brightness-90" />}
          <img
            ref={foto}
            src={url}
            alt={`Portada de ${nombre}`}
            onLoad={(e) => setChica(e.currentTarget.naturalWidth < 1200)}
            className={chica ? "relative mx-auto h-full w-auto max-w-full object-contain" : "size-full object-cover"}
            style={chica === null ? { opacity: 0 } : undefined}
          />
        </>
      ) : (
        <>
          <span className="absolute -right-16 -top-24 size-80 rounded-full bg-white/5" />
          <span className="absolute -bottom-28 left-1/3 size-72 rounded-full bg-coral/15" />
        </>
      )}
    </div>
  );
}
