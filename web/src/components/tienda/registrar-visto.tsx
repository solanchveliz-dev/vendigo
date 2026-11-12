"use client";

import { useEffect } from "react";
import { guardarVisto, type Visto } from "@/lib/vistos";

// Anota el producto en "Vistos recientemente" de este navegador.
export function RegistrarVisto(v: Omit<Visto, "visto">) {
  useEffect(() => {
    guardarVisto(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.id]);
  return null;
}
