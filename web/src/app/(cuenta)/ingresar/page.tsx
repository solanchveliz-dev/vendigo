"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Aviso, Boton, Campo, Entrada, EntradaClave } from "@/components/ui";
import { api, ErrorApi, sesion } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";

function Formulario() {
  const router = useRouter();
  const siguiente = useSearchParams().get("siguiente") || "/vendedor";
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [recordar, setRecordar] = useState(true);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const u = usuario.includes("@") ? usuario.trim() : usuario.replace(/\s/g, "");
    try {
      const r = await sesion<{ usuario: Usuario }>("ingresar", { usuario: u, password, recordar });
      if (r.usuario.rol === "comprador") router.replace("/");
      else router.replace(r.usuario.tienda_id ? siguiente : "/vendedor/crear-tienda");
    } catch (err) {
      const e = err as ErrorApi;
      if (e.codigo === "celular_no_verificado") {
        await api.post("/auth/reenviar", { celular: u, proposito: "registro" }).catch(() => null);
        router.push(`/verificar?celular=${encodeURIComponent(u)}`);
        return;
      }
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="mb-2">
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">Ingresa a VendiGo</h1>
        <p className="mt-1.5 text-gris">Usa tu celular o el correo con el que te registraste.</p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      <Campo etiqueta="Celular o correo">
        <Entrada value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="987 654 321 o nombre@correo.pe" autoComplete="username" required />
      </Campo>
      <Campo etiqueta="Contraseña">
        <EntradaClave value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tu contraseña" autoComplete="current-password" required />
      </Campo>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2.5 text-tinta">
          <input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} className="size-[18px] accent-pino" />
          Recordar mi sesión
        </label>
        <Link href="/recuperar" className="font-bold text-pino hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      <Boton bloque tamano="lg" cargando={cargando}>
        Ingresar
      </Boton>
      <p className="text-center text-sm text-gris">
        ¿No tienes cuenta?{" "}
        <Link href="/registro" className="font-bold text-pino hover:underline">
          Créala en 1 minuto
        </Link>
      </p>
    </form>
  );
}

export default function Ingresar() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}
