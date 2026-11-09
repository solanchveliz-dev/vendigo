"use client";

import { useEffect, useState } from "react";
import { MessageSquareText, Smartphone } from "lucide-react";
import { api, ErrorApi } from "@/lib/api";
import { Aviso, Boton, Entrada, Modal } from "@/components/ui";

type Metodo = { metodo: "app" | "sms"; celular?: string; codigo_dev?: string };

// Antes de algo delicado con el dinero se confirma que es la persona:
// con el código de su app de autenticación o, si no la activó, con un SMS.
export function ConfirmarIdentidad({
  abierto,
  onCerrar,
  accion,
  onConfirmar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  accion: string;
  onConfirmar: (codigo: string) => Promise<void>;
}) {
  const [m, setM] = useState<Metodo | null>(null);
  const [codigo, setCodigo] = useState("");
  const [respaldo, setRespaldo] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [espera, setEspera] = useState(0);

  async function pedir() {
    setError("");
    try {
      const r = await api.post<Metodo>("/me/confirmar");
      setM(r);
      if (r.codigo_dev) setCodigo(r.codigo_dev);
      if (r.metodo === "sms") setEspera(60);
    } catch (e) {
      setError((e as ErrorApi).message);
      setM((x) => x ?? { metodo: "sms" });
    }
  }

  useEffect(() => {
    if (!abierto) return;
    setCodigo("");
    setRespaldo(false);
    setM(null);
    pedir();
  }, [abierto]);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(espera - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await onConfirmar(codigo);
    } catch (err) {
      setError((err as ErrorApi).message);
      setCodigo("");
    } finally {
      setEnviando(false);
    }
  }

  const largo = respaldo ? 11 : 6;
  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Confirma que eres tú">
      <form onSubmit={confirmar} className="space-y-4">
        <div className="flex gap-3 rounded-2xl bg-crema p-4 text-sm text-tinta">
          {m?.metodo === "app" ? <Smartphone className="size-5 shrink-0 text-pino" /> : <MessageSquareText className="size-5 shrink-0 text-pino" />}
          <p>
            Para <b>{accion}</b>{" "}
            {!m
              ? "estamos preparando tu código…"
              : m.metodo === "app"
                ? respaldo
                  ? "escribe uno de tus códigos de respaldo."
                  : "escribe el código de 6 dígitos de tu app de autenticación."
                : `escribe el código que te enviamos por SMS al ${m.celular ?? "celular de tu cuenta"}.`}
          </p>
        </div>
        {m?.codigo_dev && <Aviso>Modo de prueba: el SMS no se envía y el código se completó solo.</Aviso>}
        {error && <Aviso tono="error">{error}</Aviso>}
        <Entrada
          value={codigo}
          onChange={(e) => setCodigo(respaldo ? e.target.value.toUpperCase().slice(0, 11) : e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode={respaldo ? "text" : "numeric"}
          autoComplete="one-time-code"
          aria-label="Código de confirmación"
          placeholder={respaldo ? "XXXXX-XXXXX" : "000000"}
          className="h-14 text-center font-display text-2xl tracking-[0.4em]"
          autoFocus
        />
        <div className="flex items-center justify-between text-sm">
          {m?.metodo === "sms" ? (
            <button type="button" onClick={pedir} disabled={espera > 0} className="font-semibold text-pino disabled:text-gris">
              {espera > 0 ? `Otro código en ${espera} s` : "Enviar otro código"}
            </button>
          ) : m?.metodo === "app" ? (
            <button type="button" onClick={() => { setRespaldo(!respaldo); setCodigo(""); }} className="font-semibold text-pino">
              {respaldo ? "Usar la app" : "Usar un código de respaldo"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Boton type="button" variante="secundario" onClick={onCerrar}>Cancelar</Boton>
            <Boton type="submit" cargando={enviando} disabled={codigo.length !== largo}>Confirmar</Boton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
