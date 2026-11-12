"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Aviso, Boton, Entrada } from "@/components/ui";
import { api, ErrorApi, sesion } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";

function bonito(c: string) {
  return c.length === 9 ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}` : c;
}

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const celular = params.get("celular") ?? "";
  const rubro = params.get("rubro") ?? "";
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

  if (!celular)
    return (
      <div className="space-y-5">
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">Primero crea tu cuenta</h1>
        <Link href="/registro" className="block">
          <Boton bloque tamano="lg">Crear cuenta</Boton>
        </Link>
      </div>
    );

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const r = await sesion<{ usuario: Usuario }>("verificar", { celular, codigo });
      const siguiente = params.get("siguiente") ?? "";
      if (r.usuario.rol === "comprador") router.replace(siguiente.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/mi-cuenta");
      else router.replace(r.usuario.tienda_id ? "/vendedor" : `/vendedor/crear-tienda${rubro ? `?rubro=${rubro}` : ""}`);
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
      <Link href="/registro" className="inline-flex items-center gap-2 text-sm font-semibold text-pino hover:underline">
        <ArrowLeft className="size-4" /> Cambiar mis datos
      </Link>
      <div>
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">Confirma tu celular</h1>
        <p className="mt-1.5 text-gris">
          Escribe el código de 6 dígitos que te enviamos por SMS al <b className="text-tinta">{bonito(celular)}</b>.
        </p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {info && <Aviso tono="ok">{info}</Aviso>}
      {params.get("dev") && <Aviso>Modo de prueba: el SMS no se envía y el código se completó solo.</Aviso>}
      <Entrada
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Código de 6 dígitos"
        className="h-16 text-center font-display text-3xl tracking-[0.6em]"
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
