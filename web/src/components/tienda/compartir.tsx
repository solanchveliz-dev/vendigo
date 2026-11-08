"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

// Comparte el enlace de la tienda (menú del celular o copia el enlace en la computadora).
export function BotonCompartir({ nombre, clase }: { nombre: string; clase: string }) {
  const [copiado, setCopiado] = useState(false);

  async function compartir() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: nombre, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button onClick={compartir} className={clase} aria-label="Compartir tienda" title={copiado ? "Enlace copiado" : "Compartir"}>
      {copiado ? <Check className="size-[18px]" /> : <Share2 className="size-[18px]" />}
    </button>
  );
}
