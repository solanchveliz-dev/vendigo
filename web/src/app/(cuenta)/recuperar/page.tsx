"use client";

import Link from "next/link";
import { useState } from "react";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui";
import { api, ErrorApi } from "@/lib/api";

export default function Recuperar() {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [celular, setCelular] = useState("");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function pedir(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const r = await api.post<{ codigo_dev?: string }>("/auth/recuperar", { celular });
      if (r.codigo_dev) setCodigo(r.codigo_dev);
      setPaso(2);
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }

  async function cambiar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await api.post("/auth/restablecer", { celular, codigo, password });
      setPaso(3);
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }

  if (paso === 3)
    return (
      <div className="space-y-5">
        <h1 className="text-3xl font-extrabold text-pino">Contraseña actualizada</h1>
        <Aviso tono="ok">Por seguridad cerramos tus sesiones abiertas. Ingresa con tu nueva contraseña.</Aviso>
        <Link href="/ingresar">
          <Boton bloque tamano="lg">Ingresar</Boton>
        </Link>
      </div>
    );

  return (
    <form onSubmit={paso === 1 ? pedir : cambiar} className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-pino">Recupera tu cuenta</h1>
        <p className="mt-1 text-gris">{paso === 1 ? "Te enviaremos un código a tu celular." : "Escribe el código y tu nueva contraseña."}</p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      {paso === 1 ? (
        <Campo etiqueta="Celular">
          <Entrada value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="987 654 321" inputMode="numeric" required />
        </Campo>
      ) : (
        <>
          <Campo etiqueta="Código de 6 dígitos">
            <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" required />
          </Campo>
          <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres.">
            <Entrada type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </Campo>
        </>
      )}
      <Boton bloque tamano="lg" cargando={cargando}>
        {paso === 1 ? "Enviar código" : "Cambiar contraseña"}
      </Boton>
      <p className="text-center text-sm">
        <Link href="/ingresar" className="font-semibold text-pino hover:underline">
          Volver a ingresar
        </Link>
      </p>
    </form>
  );
}
