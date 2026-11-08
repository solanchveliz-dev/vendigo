"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

// Botón de corazón para seguir la tienda. Funcionará con la cuenta de comprador; por ahora avisa que llega pronto.
export function BotonSeguir({ clase }: { clase: string }) {
  const [aviso, setAviso] = useState(false);

  function tocar() {
    setAviso(true);
    setTimeout(() => setAviso(false), 2500);
  }

  return (
    <div className="relative">
      <button onClick={tocar} className={clase} aria-label="Seguir tienda" title="Seguir tienda">
        <Heart className="size-5 fill-current" />
      </button>
      {aviso && (
        <span className="absolute left-1/2 top-full z-10 mt-2 w-max -translate-x-1/2 rounded-full bg-tinta px-3 py-1.5 text-xs font-semibold text-white shadow-suave">
          Pronto podrás seguir tiendas con tu cuenta
        </span>
      )}
    </div>
  );
}
