"use client";

import { useEffect } from "react";

// Cuenta una visita por sesión del navegador (para "Rendimiento" y las sugerencias del vendedor).
export function ContarVisita({ slug, productoId }: { slug: string; productoId?: string }) {
  useEffect(() => {
    const clave = `vg-visita:${slug}:${productoId ?? ""}`;
    try {
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, "1");
    } catch {
      // sin almacenamiento: igual contamos la visita
    }
    fetch(`/api/v1/tiendas/${encodeURIComponent(slug)}/visitas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productoId ? { producto_id: productoId } : {}),
      keepalive: true,
    }).catch(() => {});
  }, [slug, productoId]);
  return null;
}
