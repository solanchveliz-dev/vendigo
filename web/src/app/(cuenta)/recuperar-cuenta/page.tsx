"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Camera, Check, IdCard } from "lucide-react";
import { Aviso, Boton, Campo, Entrada, cn } from "@/components/ui";
import { api, ErrorApi } from "@/lib/api";
import { subirImagen } from "@/lib/subir";

const PASOS = ["Número nuevo", "Tus datos", "Fotos"];
const RUTA_ARCHIVO = "/auth/recuperar-cuenta/archivo";

// Para quien perdió el celular con el que creó su cuenta: pide el cambio de número con su DNI y una selfie.
// Lo revisa el equipo de VendiGo comparando con la verificación de identidad que ya tiene aprobada.
export default function RecuperarCuenta() {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [nuevo, setNuevo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [dev, setDev] = useState(false);
  const [anterior, setAnterior] = useState("");
  const [documento, setDocumento] = useState("");
  const [frente, setFrente] = useState<{ key: string; url: string } | null>(null);
  const [selfie, setSelfie] = useState<{ key: string; url: string } | null>(null);
  const [subiendo, setSubiendo] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  const limpio = (c: string) => c.replace(/\s/g, "").replace(/^\+51/, "");

  async function pedirCodigo() {
    setError("");
    setCargando(true);
    try {
      const r = await api.post<{ codigo_dev?: string }>("/auth/recuperar-cuenta/codigo", { celular_nuevo: limpio(nuevo) });
      if (r.codigo_dev) {
        setCodigo(r.codigo_dev);
        setDev(true);
      }
      setEnviado(true);
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }

  async function subir(tipo: "frente" | "selfie", archivo?: File) {
    if (!archivo) return;
    setError("");
    setSubiendo(tipo);
    try {
      const s = await subirImagen(archivo, tipo, RUTA_ARCHIVO);
      (tipo === "frente" ? setFrente : setSelfie)(s);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubiendo("");
    }
  }

  async function enviar() {
    setError("");
    if (!frente || !selfie) return setError("Sube la foto de tu DNI y tu selfie.");
    setCargando(true);
    try {
      const r = await api.post<{ mensaje: string }>("/auth/recuperar-cuenta", {
        celular_anterior: limpio(anterior),
        celular_nuevo: limpio(nuevo),
        codigo,
        documento: documento.trim(),
        frente_key: frente.key,
        selfie_key: selfie.key,
      });
      setMensaje(r.mensaje);
      setPaso(4);
    } catch (err) {
      const m = (err as ErrorApi).message;
      if (/c[oó]digo/i.test(m)) {
        setPaso(1);
        setEnviado(true);
      }
      setError(m);
    } finally {
      setCargando(false);
    }
  }

  function siguiente(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (paso === 1) {
      if (!enviado) return void pedirCodigo();
      if (codigo.length !== 6) return setError("Escribe el código de 6 dígitos.");
      return setPaso(2);
    }
    if (paso === 2) {
      if (!/^9\d{8}$/.test(limpio(anterior))) return setError("Escribe tu número anterior de 9 dígitos.");
      if (limpio(anterior) === limpio(nuevo)) return setError("El número nuevo debe ser distinto al anterior.");
      if (!/^\d{8,12}$/.test(documento.trim())) return setError("Escribe el número de tu DNI o carné de extranjería.");
      return setPaso(3);
    }
    void enviar();
  }

  if (paso === 4)
    return (
      <div className="space-y-5">
        <span className="grid size-14 place-items-center rounded-full bg-ok-claro text-ok">
          <Check className="size-7" />
        </span>
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">Solicitud enviada</h1>
        <p className="text-gris">{mensaje}</p>
        <p className="text-sm text-gris">Cuando la aprobemos, crea una contraseña nueva desde «¿Olvidaste tu contraseña?» con tu número nuevo.</p>
        <Link href="/ingresar" className="block">
          <Boton bloque tamano="lg" variante="secundario">
            Volver a ingresar
          </Boton>
        </Link>
      </div>
    );

  return (
    <form onSubmit={siguiente} className="space-y-5">
      <Link href="/ingresar" className="inline-flex items-center gap-2 text-sm font-semibold text-pino hover:underline">
        <ArrowLeft className="size-4" /> Volver a ingresar
      </Link>
      <div>
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">Recupera tu cuenta</h1>
        <p className="mt-1.5 text-gris">Si perdiste el celular con el que creaste tu cuenta, cámbialo por uno nuevo. Revisaremos tu identidad antes de hacerlo.</p>
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
        <>
          <Campo etiqueta="Tu número nuevo" ayuda="Te enviaremos un código para comprobar que es tuyo.">
            <Entrada value={nuevo} onChange={(e) => { setNuevo(e.target.value); setEnviado(false); }} placeholder="987 654 321" inputMode="numeric" autoComplete="tel" required />
          </Campo>
          {enviado && (
            <>
              {dev && <Aviso>Modo de prueba: el SMS no se envía y el código se completó solo.</Aviso>}
              <Campo etiqueta="Código de 6 dígitos">
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
              <button type="button" onClick={pedirCodigo} className="text-sm font-semibold text-pino hover:underline">
                Enviar otro código
              </button>
            </>
          )}
        </>
      )}

      {paso === 2 && (
        <>
          <Campo etiqueta="Número anterior" ayuda="El que usabas para ingresar a VendiGo.">
            <Entrada value={anterior} onChange={(e) => setAnterior(e.target.value)} placeholder="987 654 321" inputMode="numeric" required />
          </Campo>
          <Campo etiqueta="Número de DNI o carné de extranjería" ayuda="El mismo que registraste al verificar tu identidad.">
            <Entrada value={documento} onChange={(e) => setDocumento(e.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" required />
          </Campo>
        </>
      )}

      {paso === 3 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Foto titulo="Frente de tu DNI" icono={IdCard} valor={frente} cargando={subiendo === "frente"} alElegir={(f) => subir("frente", f)} />
          <Foto titulo="Selfie con tu DNI" icono={Camera} valor={selfie} cargando={subiendo === "selfie"} alElegir={(f) => subir("selfie", f)} camara />
          <p className="text-xs text-gris sm:col-span-2">Las fotos se guardan en privado y solo las ve el equipo de VendiGo para comparar con tu verificación.</p>
        </div>
      )}

      <Boton bloque tamano="lg" cargando={cargando} disabled={!!subiendo}>
        {paso === 1 ? (enviado ? "Continuar" : "Enviar código") : paso === 2 ? "Continuar" : "Enviar solicitud"}
      </Boton>
    </form>
  );
}

function Foto({
  titulo,
  icono: Icono,
  valor,
  cargando,
  alElegir,
  camara,
}: {
  titulo: string;
  icono: typeof Camera;
  valor: { url: string } | null;
  cargando: boolean;
  alElegir: (f?: File) => void;
  camara?: boolean;
}) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-linea bg-white p-4 text-center hover:border-pino">
      {valor ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={valor.url} alt={titulo} className="h-32 w-full rounded-xl object-cover" />
      ) : (
        <span className="grid size-12 place-items-center rounded-full bg-pino-claro text-pino">
          <Icono className="size-6" />
        </span>
      )}
      <span className="text-sm font-semibold text-tinta">{cargando ? "Subiendo…" : valor ? "Cambiar foto" : titulo}</span>
      <input type="file" accept="image/*" capture={camara ? "user" : undefined} className="hidden" onChange={(e) => alElegir(e.target.files?.[0])} />
    </label>
  );
}
