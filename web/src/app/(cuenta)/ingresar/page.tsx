"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui";
import { api, ErrorApi, sesion } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";

function Formulario() {
  const router = useRouter();
  const siguiente = useSearchParams().get("siguiente") || "/vendedor";
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const r = await sesion<{ usuario: Usuario }>("ingresar", { usuario, password });
      router.replace(r.usuario.tienda_id ? siguiente : "/vendedor/crear-tienda");
    } catch (err) {
      const e = err as ErrorApi;
      if (e.codigo === "celular_no_verificado") {
        await api.post("/auth/reenviar", { celular: usuario, proposito: "registro" }).catch(() => null);
        router.push(`/verificar?celular=${encodeURIComponent(usuario)}`);
        return;
      }
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-pino">Hola de nuevo</h1>
        <p className="mt-1 text-gris">Ingresa para atender tus pedidos.</p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      <Campo etiqueta="Celular o correo">
        <Entrada value={usuario} onChange={(e) => setUsuario(e.target.value)} placeholder="987 654 321" autoComplete="username" required />
      </Campo>
      <Campo etiqueta="Contraseña">
        <Entrada type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </Campo>
      <div className="text-right text-sm">
        <Link href="/recuperar" className="font-semibold text-pino hover:underline">
          Olvidé mi contraseña
        </Link>
      </div>
      <Boton bloque tamano="lg" cargando={cargando}>
        Ingresar
      </Boton>
      <p className="text-center text-sm text-gris">
        ¿Aún no vendes en VendiGo?{" "}
        <Link href="/registro" className="font-semibold text-coral hover:underline">
          Crea tu tienda gratis
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
