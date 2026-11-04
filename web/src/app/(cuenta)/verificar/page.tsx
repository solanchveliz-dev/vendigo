"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Aviso, Boton, Entrada } from "@/components/ui";
import { api, ErrorApi, sesion } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const celular = params.get("celular") ?? "";
  const [codigo, setCodigo] = useState(params.get("dev") ?? "");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [espera, setEspera] = useState(60);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(espera - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const r = await sesion<{ usuario: Usuario }>("verificar", { celular, codigo });
      router.replace(r.usuario.tienda_id ? "/vendedor" : "/vendedor/crear-tienda");
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }

  async function reenviar() {
    setError("");
    try {
      const r = await api.post<{ codigo_dev?: string }>("/auth/reenviar", { celular, proposito: "registro" });
      if (r.codigo_dev) setCodigo(r.codigo_dev);
      setInfo("Te enviamos un código nuevo.");
      setEspera(60);
    } catch (err) {
      setError((err as ErrorApi).message);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-pino">Confirma tu celular</h1>
        <p className="mt-1 text-gris">
          Escribe el código de 6 dígitos que enviamos al <b className="text-tinta">{celular}</b>.
        </p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {info && <Aviso tono="ok">{info}</Aviso>}
      {params.get("dev") && <Aviso>Modo de prueba: el código se completó solo.</Aviso>}
      <Entrada
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        className="h-14 text-center font-display text-2xl tracking-[0.5em]"
        placeholder="••••••"
        required
      />
      <Boton bloque tamano="lg" cargando={cargando} disabled={codigo.length !== 6}>
        Confirmar
      </Boton>
      <button type="button" onClick={reenviar} disabled={espera > 0} className="w-full text-sm font-semibold text-pino disabled:text-gris">
        {espera > 0 ? `Puedes pedir otro código en ${espera} s` : "Enviar otro código"}
      </button>
    </form>
  );
}

export default function Verificar() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}
