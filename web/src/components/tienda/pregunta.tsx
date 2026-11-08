"use client";

import { useState } from "react";
import { CircleHelp } from "lucide-react";

// Botón "Hacer una pregunta". Funcionará con la cuenta de comprador; por ahora avisa que llega pronto.
export function BotonPregunta() {
  const [aviso, setAviso] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          setAviso(true);
          setTimeout(() => setAviso(false), 2600);
        }}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-pino font-bold text-white transition hover:bg-pino-2"
      >
        <CircleHelp className="size-5" /> Hacer una pregunta
      </button>
      {aviso && <p className="mt-2 text-center text-sm font-semibold text-gris">Pronto podrás preguntar con tu cuenta de comprador.</p>}
    </>
  );
}
