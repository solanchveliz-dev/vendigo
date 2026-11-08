"use client";

import { useRef, useState } from "react";

// Muestra una página pública dentro del panel, tal como la ve un comprador.
// Se desactivan los clics, igual que en el prototipo: es solo para mirar.
export function VistaCliente({ src }: { src: string }) {
  const marco = useRef<HTMLIFrameElement>(null);
  const [alto, setAlto] = useState(900);

  function medir() {
    const doc = marco.current?.contentDocument;
    if (doc) setAlto(doc.documentElement.scrollHeight + 8);
  }

  return (
    <div className="overflow-hidden rounded-[22px] border-2 border-dashed border-pino/25 bg-crema">
      <iframe
        ref={marco}
        src={src}
        title="Vista previa"
        onLoad={() => {
          medir();
          setTimeout(medir, 800);
        }}
        style={{ height: alto }}
        className="pointer-events-none block w-full"
      />
    </div>
  );
}
