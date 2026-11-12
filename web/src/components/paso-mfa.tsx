"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, Smartphone } from "lucide-react";
import { Aviso, Boton, Entrada } from "@/components/ui";
import { api, ErrorApi, sesion } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { formatearRespaldo, respaldoCompleto } from "@/lib/codigo-seguridad";

export type DesafioMFA = { mfa: "configurar" | "codigo" | "sms"; desafio: string; secreto?: string; otpauth_url?: string; cuenta: string; celular?: string; codigo_dev?: string };

// Segundo paso del ingreso de administradores: código de la app de autenticación (TOTP).
export function PasoMFA({ d, alTerminar, alVolver }: { d: DesafioMFA; alTerminar: (u: Usuario) => void; alVolver: () => void }) {
  const [qr, setQr] = useState("");
  const [codigo, setCodigo] = useState(d.codigo_dev ?? "");
  const [reenviado, setReenviado] = useState("");
  const [respaldo, setRespaldo] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [codigos, setCodigos] = useState<{ lista: string[]; usuario: Usuario } | null>(null);
  const configurar = d.mfa === "configurar";
  const porSMS = d.mfa === "sms";

  async function reenviar() {
    setError("");
    try {
      const r = await api.post<{ codigo_dev?: string }>("/auth/mfa/reenviar", { desafio: d.desafio });
      if (r.codigo_dev) setCodigo(r.codigo_dev);
      setReenviado("Te enviamos otro código.");
    } catch (err) {
      setError((err as ErrorApi).message);
    }
  }

  useEffect(() => {
    if (d.otpauth_url) QRCode.toDataURL(d.otpauth_url, { width: 220, margin: 1 }).then(setQr);
  }, [d.otpauth_url]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const r = await sesion<{ usuario: Usuario; codigos_respaldo?: string[] }>("mfa", { desafio: d.desafio, codigo });
      if (r.codigos_respaldo?.length) setCodigos({ lista: r.codigos_respaldo, usuario: r.usuario });
      else alTerminar(r.usuario);
    } catch (err) {
      const x = err as ErrorApi;
      setError(x.message);
      if (x.codigo === "desafio_vencido") setTimeout(alVolver, 2500);
      setCodigo("");
    } finally {
      setCargando(false);
    }
  }

  // Al activar la app se muestran una sola vez los códigos de respaldo.
  if (codigos)
    return (
      <div className="space-y-4">
        <span className="grid size-12 place-items-center rounded-full bg-ok-claro text-ok"><ShieldCheck className="size-6" /></span>
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">Guarda tus códigos de respaldo</h1>
        <p className="text-gris">Si pierdes tu celular, cada código te deja entrar una sola vez. Guárdalos en un lugar seguro: no los volveremos a mostrar.</p>
        <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-4 font-mono text-[15px] ring-1 ring-linea">
          {codigos.lista.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <Boton variante="secundario" bloque onClick={() => navigator.clipboard?.writeText(codigos.lista.join("\n"))}>Copiar códigos</Boton>
        <Boton bloque tamano="lg" onClick={() => alTerminar(codigos.usuario)}>Ya los guardé, entrar</Boton>
      </div>
    );

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">{configurar ? "Activa la verificación en dos pasos" : "Verificación en dos pasos"}</h1>
        <p className="mt-1.5 text-gris">
          {configurar
            ? "Es obligatoria para administradores. Hazlo una sola vez:"
            : respaldo
              ? "Escribe uno de tus códigos de respaldo (XXXXX-XXXXX)."
              : porSMS
                ? `Te enviamos un código de 6 dígitos por SMS al ${d.celular ?? "celular de tu cuenta"}.`
                : "Abre tu app de autenticación y escribe el código de 6 dígitos de VendiGo."}
        </p>
      </div>

      {configurar && (
        <ol className="space-y-3 text-sm text-tinta">
          <li className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pino text-xs font-bold text-white">1</span>
            <span>Instala <b>Google Authenticator</b> o <b>Microsoft Authenticator</b> en tu celular.</span>
          </li>
          <li className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pino text-xs font-bold text-white">2</span>
            <span>En la app toca <b>+</b> y escanea este código:</span>
          </li>
          <li className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 ring-1 ring-linea">
            {qr ? <img src={qr} alt="Código QR para la app de autenticación" className="size-[180px]" /> : <div className="size-[180px] animate-pulse rounded-xl bg-crema" />}
            <span className="text-center text-xs text-gris">
              ¿No puedes escanear? Escribe esta clave en la app:
              <br />
              <b className="break-all font-mono text-sm tracking-wider text-tinta">{d.secreto?.match(/.{1,4}/g)?.join(" ")}</b>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-pino text-xs font-bold text-white">3</span>
            <span>Escribe el código de 6 dígitos que aparece en la app.</span>
          </li>
        </ol>
      )}

      {error && <Aviso tono="error">{error}</Aviso>}
      {porSMS && d.codigo_dev && !respaldo && <Aviso>Modo de prueba: el SMS no se envía y el código se completó solo.</Aviso>}
      <div className="relative">
        {!respaldo && <Smartphone className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-gris" />}
        <Entrada
          value={codigo}
          // Según la opción elegida: la app da 6 números; el código de respaldo lleva letras y números.
          onChange={(e) => setCodigo(respaldo ? formatearRespaldo(e.target.value) : e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode={respaldo ? "text" : "numeric"}
          autoComplete="one-time-code"
          autoFocus
          aria-label={respaldo ? "Código de respaldo" : "Código de 6 dígitos"}
          placeholder={respaldo ? "XXXXX-XXXXX" : "000000"}
          className={respaldo ? "h-14 text-center font-mono text-xl tracking-widest" : "h-14 pl-12 text-center font-display text-2xl tracking-[0.5em]"}
          required
        />
      </div>
      <Boton bloque tamano="lg" cargando={cargando} disabled={respaldo ? !respaldoCompleto(codigo) : codigo.length !== 6}>
        {configurar ? "Activar y entrar" : "Verificar"}
      </Boton>
      {porSMS && !respaldo && (
        <p className="text-center text-sm text-gris">
          {reenviado || "¿No te llegó?"}{" "}
          <button type="button" onClick={reenviar} className="font-semibold text-pino hover:underline">Enviar otro código</button>
        </p>
      )}
      <div className="flex justify-between text-sm">
        <button type="button" onClick={alVolver} className="font-semibold text-gris hover:text-tinta">Volver</button>
        {!configurar && (
          <button type="button" onClick={() => { setRespaldo(!respaldo); setCodigo(""); setError(""); }} className="font-semibold text-pino hover:underline">
            {respaldo ? (porSMS ? "Usar el código del SMS" : "Usar la app") : "Usar un código de respaldo"}
          </button>
        )}
      </div>
    </form>
  );
}
