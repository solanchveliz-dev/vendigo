"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui";
import { api, ErrorApi } from "@/lib/api";

export default function Registro() {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", celular: "", email: "", password: "" });
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const cambiar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!acepto) return setError("Acepta los términos y la política de privacidad para continuar.");
    setError("");
    setCargando(true);
    try {
      const r = await api.post<{ celular: string; codigo_dev?: string }>("/auth/registro", { ...f, rol: "vendedor" });
      const q = new URLSearchParams({ celular: r.celular });
      if (r.codigo_dev) q.set("dev", r.codigo_dev);
      router.push(`/verificar?${q}`);
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-pino">Crea tu cuenta de vendedor</h1>
        <p className="mt-1 text-gris">Es gratis. El primer mes de cualquier plan también.</p>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
      <Campo etiqueta="Tu nombre completo">
        <Entrada value={f.nombre} onChange={cambiar("nombre")} placeholder="Camila Rojas" autoComplete="name" required />
      </Campo>
      <Campo etiqueta="Celular" ayuda="Te enviaremos un código para confirmar que es tuyo.">
        <Entrada value={f.celular} onChange={cambiar("celular")} placeholder="987 654 321" inputMode="numeric" autoComplete="tel" required />
      </Campo>
      <Campo etiqueta="Correo (opcional)">
        <Entrada type="email" value={f.email} onChange={cambiar("email")} placeholder="tu@correo.com" autoComplete="email" />
      </Campo>
      <Campo etiqueta="Contraseña" ayuda="Mínimo 8 caracteres.">
        <Entrada type="password" value={f.password} onChange={cambiar("password")} autoComplete="new-password" minLength={8} required />
      </Campo>
      <label className="flex items-start gap-3 text-sm text-gris">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="mt-1 size-4 accent-pino" />
        <span>Acepto los términos y condiciones y la política de privacidad de VendiGo (Ley N.° 29733).</span>
      </label>
      <Boton bloque tamano="lg" cargando={cargando}>
        Continuar
      </Boton>
      <p className="text-center text-sm text-gris">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-semibold text-pino hover:underline">
          Ingresa
        </Link>
      </p>
    </form>
  );
}
