"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Registra el intento de abrir una sección de otro rol (lo ve el admin en Seguridad).
export function RegistrarAccesoDenegado() {
  const desde = useSearchParams().get("desde") ?? "";
  useEffect(() => {
    if (!desde) return;
    fetch("/api/v1/me/acceso-denegado", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruta: desde }) }).catch(() => null);
  }, [desde]);
  return null;
}
