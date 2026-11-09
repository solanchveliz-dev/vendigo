"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Aviso, Boton, Campo, Entrada, EntradaClave, Insignia, Modal, useAvisar } from "@/components/ui";

type Estado = { activo: boolean; respaldo_restantes: number; obligatoria: boolean };

// Fila de Configuración → Seguridad para activar o quitar la verificación en dos pasos (opcional para vendedoras).
export function DosPasos({ Fila }: { Fila: (p: { titulo: string; detalle?: string; children: React.ReactNode }) => React.ReactElement }) {
  const { datos, recargar } = useApi<Estado>("/me/mfa");
  const avisar = useAvisar();
  const [paso, setPaso] = useState<"" | "qr" | "codigos" | "quitar">("");
  const [qr, setQr] = useState({ img: "", secreto: "" });
  const [codigo, setCodigo] = useState("");
  const [clave, setClave] = useState("");
  const [codigos, setCodigos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!datos) return null;

  async function iniciar() {
    setError("");
    setCodigo("");
    try {
      const r = await api.post<{ secreto: string; otpauth_url: string }>("/me/mfa/iniciar");
      setQr({ img: await QRCode.toDataURL(r.otpauth_url, { width: 200, margin: 1 }), secreto: r.secreto });
      setPaso("qr");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }
  async function activar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const r = await api.post<{ codigos_respaldo: string[] }>("/me/mfa/activar", { codigo });
      setCodigos(r.codigos_respaldo);
      setPaso("codigos");
      recargar();
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setEnviando(false);
    }
  }
  async function quitar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const r = await api.post<{ mensaje: string }>("/me/mfa/desactivar", { password: clave, codigo });
      avisar(r.mensaje);
      setPaso("");
      setClave("");
      setCodigo("");
      recargar();
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Fila
        titulo="Verificación en dos pasos"
        detalle={
          datos.activo
            ? `Al ingresar te pedimos el código de tu app. Te quedan ${datos.respaldo_restantes} códigos de respaldo.`
            : "Recomendado: además de tu contraseña, te pediremos un código de Google Authenticator al ingresar."
        }
      >
        <div className="flex items-center gap-3">
          {datos.activo && <Insignia tono="ok">Activa</Insignia>}
          {datos.obligatoria ? (
            <Insignia tono="pino">Obligatoria</Insignia>
          ) : datos.activo ? (
            <Boton variante="secundario" tamano="sm" onClick={() => { setError(""); setCodigo(""); setPaso("quitar"); }}>Desactivar</Boton>
          ) : (
            <Boton tamano="sm" onClick={iniciar}>Activar</Boton>
          )}
        </div>
      </Fila>

      <Modal abierto={paso === "qr"} onCerrar={() => setPaso("")} titulo="Activar verificación en dos pasos">
        <form onSubmit={activar} className="space-y-4 text-sm">
          <p className="text-gris">1. Instala <b className="text-tinta">Google Authenticator</b> o <b className="text-tinta">Microsoft Authenticator</b>. 2. Toca <b className="text-tinta">+</b> y escanea el código. 3. Escribe el código de 6 dígitos.</p>
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-crema p-4">
            {qr.img && <img src={qr.img} alt="Código QR" className="size-[180px] rounded-lg bg-white p-1" />}
            <span className="text-center text-xs text-gris">
              O escribe esta clave: <b className="break-all font-mono text-tinta">{qr.secreto.match(/.{1,4}/g)?.join(" ")}</b>
            </span>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
          <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Código de 6 dígitos" className="h-14 text-center font-display text-2xl tracking-[0.4em]" />
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setPaso("")}>Cancelar</Boton>
            <Boton type="submit" cargando={enviando} disabled={codigo.length !== 6}>Activar</Boton>
          </div>
        </form>
      </Modal>

      <Modal abierto={paso === "codigos"} onCerrar={() => setPaso("")} titulo="Guarda tus códigos de respaldo">
        <div className="space-y-4">
          <p className="text-sm text-gris">Si pierdes tu celular, cada código te deja entrar una sola vez. No los volveremos a mostrar.</p>
          <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-crema p-4 font-mono text-[15px]">
            {codigos.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <div className="flex justify-end gap-2">
            <Boton variante="secundario" onClick={() => navigator.clipboard?.writeText(codigos.join("\n"))}>Copiar</Boton>
            <Boton onClick={() => { setPaso(""); avisar("Listo, activaste la verificación en dos pasos."); }}>Ya los guardé</Boton>
          </div>
        </div>
      </Modal>

      <Modal abierto={paso === "quitar"} onCerrar={() => setPaso("")} titulo="Desactivar verificación en dos pasos">
        <form onSubmit={quitar} className="space-y-4">
          <Aviso tono="aviso">Tu cuenta quedará protegida solo con tu contraseña.</Aviso>
          {error && <Aviso tono="error">{error}</Aviso>}
          <Campo etiqueta="Tu contraseña">
            <EntradaClave value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required />
          </Campo>
          <Campo etiqueta="Código de tu app (o un código de respaldo)">
            <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 11))} autoComplete="one-time-code" required />
          </Campo>
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setPaso("")}>Cancelar</Boton>
            <Boton type="submit" variante="peligro" cargando={enviando}>Desactivar</Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
