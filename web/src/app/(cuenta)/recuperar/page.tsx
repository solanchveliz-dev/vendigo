"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Aviso, Boton, Campo, Entrada, EntradaClave, cn } from "@/components/ui";
import { api, ErrorApi } from "@/lib/api";
import { MedidorClave, claveValida } from "@/components/medidor-clave";

const PASOS = ["Celular", "Código", "Nueva contraseña"];

export default function Recuperar() {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [celular, setCelular] = useState("");
  const [codigo, setCodigo] = useState("");
  const [dev, setDev] = useState(false);
  const [password, setPassword] = useState("");
  const [repite, setRepite] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function pedir(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    setCargando(true);
    try {
      const r = await api.post<{ codigo_dev?: string }>("/auth/recuperar", { celular: celular.replace(/\s/g, "") });
      if (r.codigo_dev) {
        setCodigo(r.codigo_dev);
        setDev(true);
      }
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
    if (!claveValida(password)) return setError("Tu contraseña debe tener 8 caracteres o más, una mayúscula, una minúscula y un número.");
    if (password !== repite) return setError("Las contraseñas no coinciden.");
    setCargando(true);
    try {
      await api.post("/auth/restablecer", { celular: celular.replace(/\s/g, ""), codigo, password });
      setPaso(4);
    } catch (err) {
      const m = (err as ErrorApi).message;
      // Si el problema es el código, vuelve al paso del código.
      if (/c[oó]digo/i.test(m)) setPaso(2);
      setError(m);
    } finally {
      setCargando(false);
    }
  }

  if (paso === 4)
    return (
      <div className="space-y-5">
        <span className="grid size-14 place-items-center rounded-full bg-ok-claro text-ok">
          <Check className="size-7" />
        </span>
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">Contraseña actualizada</h1>
        <p className="text-gris">Por seguridad cerramos tu cuenta en todos los equipos. Ingresa con tu nueva contraseña.</p>
        <Link href="/ingresar" className="block">
          <Boton bloque tamano="lg">Ingresar</Boton>
        </Link>
      </div>
    );

  return (
    <form onSubmit={paso === 1 ? pedir : paso === 2 ? (e) => { e.preventDefault(); setError(""); setPaso(3); } : cambiar} className="space-y-5">
      <Link href="/ingresar" className="inline-flex items-center gap-2 text-sm font-semibold text-pino hover:underline">
        <ArrowLeft className="size-4" /> Volver a ingresar
      </Link>
      <div>
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">Recupera tu contraseña</h1>
        <p className="mt-1.5 text-gris">Te enviaremos un código de 6 dígitos por SMS a tu celular.</p>
      </div>

      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
        {PASOS.map((t, i) => {
          const n = i + 1;
          const hecho = paso > n;
          return (
            <li key={t} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full text-xs font-bold",
                  paso === n ? "bg-pino text-white" : hecho ? "bg-pino-claro text-pino" : "bg-white text-gris ring-1 ring-linea",
                )}
              >
                {hecho ? <Check className="size-3.5" /> : n}
              </span>
              <span className={cn("text-sm font-semibold", paso === n ? "text-tinta" : "text-gris")}>{t}</span>
              {n < PASOS.length && <span className="h-px w-9 bg-linea" />}
            </li>
          );
        })}
      </ol>

      {error && <Aviso tono="error">{error}</Aviso>}

      {paso === 1 && (
        <Campo etiqueta="Celular" ayuda="El número con el que creaste tu cuenta.">
          <Entrada value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="987 654 321" inputMode="numeric" autoComplete="tel" required />
        </Campo>
      )}
      {paso === 2 && (
        <>
          {dev && <Aviso>Modo de prueba: el SMS no se envía y el código se completó solo.</Aviso>}
          <Campo etiqueta="Código de 6 dígitos" ayuda={`Lo enviamos al ${celular}. Vence en 10 minutos.`}>
            <Entrada
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="h-14 text-center font-display text-2xl tracking-[0.5em]"
              placeholder="••••••"
              required
            />
          </Campo>
          <button type="button" onClick={() => pedir()} className="text-sm font-semibold text-pino hover:underline">
            Enviar otro código
          </button>
        </>
      )}
      {paso === 3 && (
        <>
          <Campo etiqueta="Nueva contraseña">
            <EntradaClave value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" minLength={8} autoComplete="new-password" required />
            <MedidorClave clave={password} />
          </Campo>
          <Campo etiqueta="Repite la contraseña">
            <EntradaClave value={repite} onChange={(e) => setRepite(e.target.value)} minLength={8} autoComplete="new-password" required />
          </Campo>
        </>
      )}

      <Boton bloque tamano="lg" cargando={cargando} disabled={paso === 2 && codigo.length !== 6}>
        {paso === 1 ? "Enviar código" : paso === 2 ? "Continuar" : "Guardar contraseña"}
      </Boton>
    </form>
  );
}
