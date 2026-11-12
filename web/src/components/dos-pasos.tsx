"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { MessageSquare, Smartphone } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { formatearCodigo } from "@/lib/codigo-seguridad";
import { Aviso, Boton, Campo, Entrada, EntradaClave, Insignia, Modal, cn, useAvisar } from "@/components/ui";

type Estado = { activo: boolean; metodo: "app" | "sms"; respaldo_restantes: number; obligatoria: boolean; celular: string };
type Paso = "" | "elegir" | "qr" | "sms" | "codigos" | "quitar" | "nuevos";

const NOTA_RESPALDO = "Al terminar te daremos 8 códigos de respaldo para entrar si un día pierdes tu celular.";

// Fila de Configuración → Seguridad: activar el segundo paso con la app o por SMS, renovar los códigos de
// respaldo o desactivarlo (para administradores es obligatorio y siempre con la app).
export function DosPasos({ Fila }: { Fila: (p: { titulo: string; detalle?: string; children: React.ReactNode }) => React.ReactElement }) {
  const { datos, recargar } = useApi<Estado>("/me/mfa");
  const avisar = useAvisar();
  const [paso, setPaso] = useState<Paso>("");
  const [qr, setQr] = useState({ img: "", secreto: "" });
  const [codigo, setCodigo] = useState("");
  const [clave, setClave] = useState("");
  const [codigos, setCodigos] = useState<string[]>([]);
  const [guardados, setGuardados] = useState(false);
  const [smsEnviado, setSmsEnviado] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!datos) return null;

  function abrir(p: Paso) {
    setError("");
    setCodigo("");
    setClave("");
    setSmsEnviado("");
    setPaso(p);
  }

  async function elegirApp() {
    abrir("qr");
    try {
      const r = await api.post<{ secreto: string; otpauth_url: string }>("/me/mfa/iniciar");
      setQr({ img: await QRCode.toDataURL(r.otpauth_url, { width: 200, margin: 1 }), secreto: r.secreto });
    } catch (e) {
      setError((e as ErrorApi).message);
    }
  }

  // Envía un código por SMS al celular de la cuenta (para activar por SMS o confirmar con ese método).
  async function enviarSMS() {
    setError("");
    try {
      const r = await api.post<{ celular: string; codigo_dev?: string }>("/me/codigo");
      setSmsEnviado(r.celular);
      if (r.codigo_dev) setCodigo(r.codigo_dev);
    } catch (e) {
      setError((e as ErrorApi).message);
    }
  }

  function elegirSMS() {
    abrir("sms");
    void enviarSMS();
  }

  async function llamar(ruta: string, cuerpo: object, alTerminar: (r: { codigos_respaldo?: string[]; mensaje?: string }) => void) {
    setEnviando(true);
    setError("");
    try {
      alTerminar(await api.post<{ codigos_respaldo?: string[]; mensaje?: string }>(ruta, cuerpo));
      recargar();
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setEnviando(false);
    }
  }

  const mostrarCodigos = (r: { codigos_respaldo?: string[] }) => {
    setCodigos(r.codigos_respaldo ?? []);
    setGuardados(false);
    setPaso("codigos");
  };

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (paso === "qr") void llamar("/me/mfa/activar", { codigo }, mostrarCodigos);
    if (paso === "sms") void llamar("/me/mfa/sms", { codigo }, mostrarCodigos);
    if (paso === "nuevos") void llamar("/me/mfa/respaldo", { password: clave, codigo }, mostrarCodigos);
    if (paso === "quitar")
      void llamar("/me/mfa/desactivar", { password: clave, codigo }, (r) => {
        avisar(r.mensaje ?? "Listo.");
        setPaso("");
      });
  }

  const texto = codigos.join("\n");
  function descargar() {
    const url = URL.createObjectURL(new Blob([`Códigos de respaldo de VendiGo\nCada uno sirve una sola vez.\n\n${texto}\n`], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "vendigo-codigos-de-respaldo.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
  function imprimir() {
    const v = window.open("", "_blank", "width=480,height=600");
    if (!v) return;
    v.document.write(
      `<title>Códigos de respaldo de VendiGo</title><body style="font-family:sans-serif;padding:24px"><h2>Códigos de respaldo de VendiGo</h2><p>Cada uno sirve una sola vez.</p><pre style="font-size:18px;line-height:1.8">${texto}</pre></body>`,
    );
    v.document.close();
    v.print();
  }

  const porSMS = datos.metodo === "sms";
  const detalle = datos.activo
    ? `${porSMS ? `Al ingresar te enviamos un código por SMS al ${datos.celular}.` : "Al ingresar te pedimos el código de tu app."} Te quedan ${datos.respaldo_restantes} códigos de respaldo.`
    : "Recomendado: además de tu contraseña, te pediremos un código al ingresar (con una app o por SMS).";

  // Confirmar con contraseña + código (para renovar los códigos o desactivar).
  const confirmar = (
    <>
      <Campo etiqueta="Tu contraseña">
        <EntradaClave value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="current-password" required />
      </Campo>
      <Campo etiqueta={porSMS ? "Código del SMS (o un código de respaldo)" : "Código de tu app (o un código de respaldo)"}>
        <Entrada value={codigo} onChange={(e) => setCodigo(formatearCodigo(e.target.value))} autoComplete="one-time-code" placeholder="000000 o XXXXX-XXXXX" required />
      </Campo>
      {porSMS && (
        <button type="button" onClick={enviarSMS} className="text-sm font-semibold text-pino hover:underline">
          {smsEnviado ? `Enviado al ${smsEnviado}. Enviar otro` : "Enviarme el código por SMS"}
        </button>
      )}
    </>
  );

  return (
    <>
      <Fila titulo="Verificación en dos pasos" detalle={detalle}>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {datos.activo && <Insignia tono="ok">{porSMS ? "Activa por SMS" : "Activa con app"}</Insignia>}
          {datos.obligatoria && <Insignia tono="pino">Obligatoria</Insignia>}
          {datos.activo ? (
            <>
              <Boton variante="secundario" tamano="sm" onClick={() => abrir("nuevos")}>Nuevos códigos</Boton>
              {!datos.obligatoria && <Boton variante="secundario" tamano="sm" onClick={() => abrir("quitar")}>Desactivar</Boton>}
            </>
          ) : (
            <Boton tamano="sm" onClick={() => abrir("elegir")}>Activar</Boton>
          )}
        </div>
      </Fila>

      <Modal abierto={paso === "elegir"} onCerrar={() => setPaso("")} titulo="¿Cómo quieres recibir tu código?">
        <div className="space-y-3">
          <Opcion icono={Smartphone} titulo="Con una app (recomendado)" texto="Google Authenticator o Microsoft Authenticator. Es la más segura y funciona sin señal." onClick={elegirApp} />
          <Opcion icono={MessageSquare} titulo="Por SMS" texto="Te enviamos un código a tu celular cada vez que ingreses. No instalas nada." onClick={elegirSMS} />
          <p className="text-xs text-gris">{NOTA_RESPALDO}</p>
        </div>
      </Modal>

      <Modal abierto={paso === "qr"} onCerrar={() => setPaso("")} titulo="Activar con una app">
        <form onSubmit={enviar} className="space-y-4 text-sm">
          <p className="text-gris">1. Instala <b className="text-tinta">Google Authenticator</b> o <b className="text-tinta">Microsoft Authenticator</b>. 2. Toca <b className="text-tinta">+</b> y escanea el código. 3. Escribe el código de 6 dígitos que te muestra la app.</p>
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-crema p-4">
            {qr.img ? <img src={qr.img} alt="Código QR" className="size-[180px] rounded-lg bg-white p-1" /> : <div className="size-[180px] animate-pulse rounded-lg bg-white" />}
            <span className="text-center text-xs text-gris">
              ¿No puedes escanear? En la app elige «Ingresar clave» y escribe: <b className="break-all font-mono text-tinta">{qr.secreto.match(/.{1,4}/g)?.join(" ")}</b>
            </span>
          </div>
          {error && <Aviso tono="error">{error}</Aviso>}
          <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Código de 6 dígitos" className="h-14 text-center font-display text-2xl tracking-[0.4em]" />
          <p className="text-xs text-gris">{NOTA_RESPALDO}</p>
          <div className="flex justify-between gap-2">
            <Boton type="button" variante="fantasma" onClick={() => abrir("elegir")}>Elegir otra forma</Boton>
            <Boton type="submit" cargando={enviando} disabled={codigo.length !== 6}>Activar</Boton>
          </div>
        </form>
      </Modal>

      <Modal abierto={paso === "sms"} onCerrar={() => setPaso("")} titulo="Activar por SMS">
        <form onSubmit={enviar} className="space-y-4 text-sm">
          <p className="text-gris">
            {smsEnviado ? <>Te enviamos un código de 6 dígitos al <b className="text-tinta">{smsEnviado}</b>. Escríbelo para activar.</> : "Enviando el código a tu celular…"}
          </p>
          {error && <Aviso tono="error">{error}</Aviso>}
          <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Código de 6 dígitos" className="h-14 text-center font-display text-2xl tracking-[0.4em]" />
          <button type="button" onClick={enviarSMS} className="text-sm font-semibold text-pino hover:underline">Enviar otro código</button>
          <p className="text-xs text-gris">{NOTA_RESPALDO}</p>
          <div className="flex justify-between gap-2">
            <Boton type="button" variante="fantasma" onClick={() => abrir("elegir")}>Elegir otra forma</Boton>
            <Boton type="submit" cargando={enviando} disabled={codigo.length !== 6}>Activar</Boton>
          </div>
        </form>
      </Modal>

      <Modal abierto={paso === "codigos"} onCerrar={() => guardados && setPaso("")} titulo="Guarda tus códigos de respaldo">
        <div className="space-y-4">
          <p className="text-sm text-gris">Si pierdes tu celular, cada código te deja entrar <b className="text-tinta">una sola vez</b>. No los volveremos a mostrar: descárgalos, imprímelos o anótalos.</p>
          <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-white p-4 font-mono text-[15px] ring-1 ring-linea">
            {codigos.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <div className="grid grid-cols-3 gap-2">
            <Boton variante="secundario" tamano="sm" onClick={() => { navigator.clipboard?.writeText(texto); avisar("Códigos copiados."); }}>Copiar</Boton>
            <Boton variante="secundario" tamano="sm" onClick={descargar}>Descargar</Boton>
            <Boton variante="secundario" tamano="sm" onClick={imprimir}>Imprimir</Boton>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-tinta">
            <input type="checkbox" checked={guardados} onChange={(e) => setGuardados(e.target.checked)} className="size-[18px] accent-pino" />
            Ya guardé mis códigos en un lugar seguro
          </label>
          <div className="flex justify-end">
            <Boton disabled={!guardados} onClick={() => { setPaso(""); avisar("Listo, tu cuenta tiene verificación en dos pasos."); }}>Listo</Boton>
          </div>
        </div>
      </Modal>

      <Modal abierto={paso === "nuevos"} onCerrar={() => setPaso("")} titulo="Nuevos códigos de respaldo">
        <form onSubmit={enviar} className="space-y-4">
          <Aviso>Te daremos 8 códigos nuevos y los anteriores dejarán de servir.</Aviso>
          {error && <Aviso tono="error">{error}</Aviso>}
          {confirmar}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setPaso("")}>Cancelar</Boton>
            <Boton type="submit" cargando={enviando}>Generar códigos</Boton>
          </div>
        </form>
      </Modal>

      <Modal abierto={paso === "quitar"} onCerrar={() => setPaso("")} titulo="Desactivar verificación en dos pasos">
        <form onSubmit={enviar} className="space-y-4">
          <Aviso tono="aviso">Tu cuenta quedará protegida solo con tu contraseña.</Aviso>
          {error && <Aviso tono="error">{error}</Aviso>}
          {confirmar}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setPaso("")}>Cancelar</Boton>
            <Boton type="submit" variante="peligro" cargando={enviando}>Desactivar</Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Opcion({ icono: Icono, titulo, texto, onClick }: { icono: typeof Smartphone; titulo: string; texto: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-start gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-linea transition hover:ring-pino")}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-pino-claro text-pino"><Icono className="size-5" /></span>
      <span>
        <b className="block text-tinta">{titulo}</b>
        <span className="text-sm text-gris">{texto}</span>
      </span>
    </button>
  );
}
