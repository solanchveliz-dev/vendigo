"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api, ErrorApi } from "@/lib/api";
import { Boton, Cargando, useAvisar } from "@/components/ui";

// Mercado Pago vuelve aquí después de que la vendedora autoriza su cuenta (?code=…&state=…).
// La página envía el código a la API con la sesión de la vendedora y vuelve a "Cómo te pagan".
function Vincular() {
  const router = useRouter();
  const sp = useSearchParams();
  const avisar = useAvisar();
  const [error, setError] = useState("");
  const enviado = useRef(false);

  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    const code = sp.get("code") ?? "";
    const state = sp.get("state") ?? "";
    if (!code || !state) {
      setError("Mercado Pago no envió la autorización. Vuelve a intentarlo desde Cómo te pagan.");
      return;
    }
    api.post<{ mensaje: string }>("/vendedor/mercadopago/vincular", { code, state })
      .then((r) => {
        avisar(r.mensaje);
        router.replace("/vendedor/tienda/pagos");
      })
      .catch((e) => setError((e as ErrorApi).message));
  }, [sp, router, avisar]);

  if (!error) return <Cargando />;
  return (
    <div className="mx-auto max-w-md rounded-[22px] bg-white p-6 text-center shadow-suave ring-1 ring-linea/60">
      <p className="font-bold text-tinta">No se pudo vincular Mercado Pago</p>
      <p className="mt-1 text-sm text-gris">{error}</p>
      <Boton className="mt-4" onClick={() => router.replace("/vendedor/tienda/pagos")}>Volver</Boton>
    </div>
  );
}

export default function VolverDeMercadoPago() {
  return (
    <Suspense fallback={<Cargando />}>
      <Vincular />
    </Suspense>
  );
}
