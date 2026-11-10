"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Building2, Camera, ChevronRight, Clock, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha } from "@/lib/formato";
import { subirImagen } from "@/lib/subir";
import { Aviso, Boton, Campo, Cargando, Entrada, Selector, Tarjeta, useAvisar } from "@/components/ui";

type Estado = { estado: string; tipo_documento?: string; ultimos4?: string; nombre_completo?: string; motivo_rechazo?: string; creado_en?: string };
type Datos = Estado & { negocio: Estado };
type Archivo = { key: string; url: string } | null;

function Foto({ titulo, valor, onChange }: { titulo: string; valor: Archivo; onChange: (f: File) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-linea bg-white p-4 text-center">
      {valor ? <img src={valor.url} alt="" className="h-28 rounded-lg object-cover" /> : <Camera className="size-7 text-pino" />}
      <span className="text-sm font-semibold text-pino">{titulo}</span>
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])} />
    </label>
  );
}

function Resultado({ icono, tono, titulo, texto }: { icono: React.ReactNode; tono: "ok" | "aviso"; titulo: string; texto: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tono === "ok" ? "bg-pino-claro text-pino" : "bg-aviso-claro text-aviso"}`}>{icono}</span>
      <div>
        <p className="font-display text-lg font-extrabold text-tinta">{titulo}</p>
        <p className="text-sm text-gris">{texto}</p>
      </div>
    </div>
  );
}

// Verificación de la vendedora, en dos partes que revisa el equipo de VendiGo:
// · Identidad (DNI o carné de extranjería): obligatoria. Sin ella, la tienda no se muestra a los compradores.
// · RUC (opcional): da la insignia "Negocio con RUC verificado".
export default function Verificacion() {
  const { datos, setDatos } = useApi<Datos>("/vendedor/verificacion");
  const avisar = useAvisar();
  const [f, setF] = useState({ tipo_documento: "dni", numero: "", nombre_completo: "" });
  const [fotos, setFotos] = useState<Record<string, Archivo>>({ frente: null, reverso: null, selfie: null });
  const [ruc, setRuc] = useState({ numero: "", nombre_completo: "" });
  const [ficha, setFicha] = useState<Archivo>(null);
  const [error, setError] = useState("");
  const [errorRuc, setErrorRuc] = useState("");
  const [enviando, setEnviando] = useState<"" | "identidad" | "ruc">("");

  if (!datos) return <Cargando />;
  const negocio = datos.negocio ?? { estado: "sin_enviar" };

  async function subir(file: File) {
    try {
      return await subirImagen(file, "dni");
    } catch (e) {
      avisar((e as Error).message, "error");
      return null;
    }
  }

  async function enviarIdentidad(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando("identidad");
    try {
      setDatos(await api.post<Datos>("/vendedor/verificacion", { ...f, frente_key: fotos.frente?.key ?? "", reverso_key: fotos.reverso?.key ?? "", selfie_key: fotos.selfie?.key ?? "" }));
      avisar("Enviado. Revisamos tu identidad en menos de 24 horas.");
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setEnviando("");
    }
  }

  async function enviarRuc(e: React.FormEvent) {
    e.preventDefault();
    setErrorRuc("");
    setEnviando("ruc");
    try {
      setDatos(await api.post<Datos>("/vendedor/verificacion", { tipo_documento: "ruc", ...ruc, frente_key: ficha?.key ?? "", reverso_key: "", selfie_key: "" }));
      avisar("Enviado. Revisamos tu RUC en menos de 24 horas.");
    } catch (err) {
      setErrorRuc((err as ErrorApi).message);
    } finally {
      setEnviando("");
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor" className="hover:text-pino">Inicio</Link> <ChevronRight className="size-3.5" /> Verificación
      </p>
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Verifica tu tienda</h1>
        <p className="text-sm text-gris">Así tus clientes saben que hay una persona real detrás de tu tienda y nadie puede usarla para estafar. Lo revisa el equipo de VendiGo.</p>
      </div>

      {/* 1. Identidad (obligatoria) */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-tinta"><ShieldCheck className="size-5 text-pino" /> 1. Tu identidad <span className="text-sm font-semibold text-coral">· obligatoria</span></h2>
        {datos.estado === "aprobada" ? (
          <Resultado
            icono={<ShieldCheck className="size-5" />}
            tono="ok"
            titulo="Identidad verificada"
            texto={<>{datos.nombre_completo} · {datos.tipo_documento?.toUpperCase()} •••• {datos.ultimos4} · desde el {fecha(datos.creado_en)}. Tu tienda ya es visible para los compradores.</>}
          />
        ) : datos.estado === "pendiente" ? (
          <Resultado icono={<Clock className="size-5" />} tono="aviso" titulo="Estamos revisando tu identidad" texto={<>Enviado el {fecha(datos.creado_en, true)}. Tu tienda se mostrará a los compradores apenas el equipo de VendiGo la apruebe (menos de 24 horas).</>} />
        ) : (
          <form onSubmit={enviarIdentidad} className="space-y-4">
            <Aviso tono="aviso">
              <span className="flex items-start gap-2"><EyeOff className="mt-0.5 size-4 shrink-0" /> Tu tienda todavía no se muestra a los compradores. Se publica cuando verificamos tu identidad.</span>
            </Aviso>
            {datos.estado === "rechazada" && <Aviso tono="error">No pudimos verificar tus datos: {datos.motivo_rechazo}. Inténtalo de nuevo.</Aviso>}
            {error && <Aviso tono="error">{error}</Aviso>}
            <Tarjeta className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                <Campo etiqueta="Documento">
                  <Selector value={f.tipo_documento} onChange={(e) => setF({ ...f, tipo_documento: e.target.value })}>
                    <option value="dni">DNI</option>
                    <option value="ce">Carné de extranjería</option>
                  </Selector>
                </Campo>
                <Campo etiqueta="Número">
                  <Entrada value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value.replace(/\D/g, "") })} inputMode="numeric" maxLength={12} required />
                </Campo>
              </div>
              <Campo etiqueta="Nombre completo (como figura en tu documento)">
                <Entrada value={f.nombre_completo} onChange={(e) => setF({ ...f, nombre_completo: e.target.value })} required />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-3">
                <Foto titulo="Documento: frente" valor={fotos.frente} onChange={async (x) => { const r = await subir(x); if (r) setFotos((s) => ({ ...s, frente: r })); }} />
                <Foto titulo="Documento: reverso" valor={fotos.reverso} onChange={async (x) => { const r = await subir(x); if (r) setFotos((s) => ({ ...s, reverso: r })); }} />
                <Foto titulo="Selfie con tu documento" valor={fotos.selfie} onChange={async (x) => { const r = await subir(x); if (r) setFotos((s) => ({ ...s, selfie: r })); }} />
              </div>
            </Tarjeta>
            <Boton variante="acento" cargando={enviando === "identidad"} disabled={!fotos.frente || !fotos.selfie}>
              <ShieldCheck className="size-4" /> Enviar para revisión
            </Boton>
          </form>
        )}
      </section>

      {/* 2. RUC (opcional) */}
      <section className="space-y-3 pt-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-tinta"><Building2 className="size-5 text-pino" /> 2. Tu negocio con RUC <span className="text-sm font-semibold text-gris">· opcional</span></h2>
        {negocio.estado === "aprobada" ? (
          <Resultado icono={<BadgeCheck className="size-5" />} tono="ok" titulo="Negocio con RUC verificado" texto={<>{negocio.nombre_completo} · RUC •••• {negocio.ultimos4}. Tu tienda muestra la insignia a los compradores.</>} />
        ) : negocio.estado === "pendiente" ? (
          <Resultado icono={<Clock className="size-5" />} tono="aviso" titulo="Estamos revisando tu RUC" texto={<>Enviado el {fecha(negocio.creado_en, true)}. Te avisamos cuando esté listo.</>} />
        ) : (
          <form onSubmit={enviarRuc} className="space-y-4">
            <p className="text-sm text-gris">Si tu negocio tiene RUC, envíalo y tu tienda mostrará la insignia <b className="text-tinta">“Negocio con RUC verificado”</b>. Comparamos tu ficha RUC con SUNAT.</p>
            {negocio.estado === "rechazada" && <Aviso tono="error">No pudimos verificar tu RUC: {negocio.motivo_rechazo}. Inténtalo de nuevo.</Aviso>}
            {errorRuc && <Aviso tono="error">{errorRuc}</Aviso>}
            <Tarjeta className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                <Campo etiqueta="RUC">
                  <Entrada value={ruc.numero} onChange={(e) => setRuc({ ...ruc, numero: e.target.value.replace(/\D/g, "") })} inputMode="numeric" maxLength={11} placeholder="11 dígitos" required />
                </Campo>
                <Campo etiqueta="Razón social o nombre (como en la ficha RUC)">
                  <Entrada value={ruc.nombre_completo} onChange={(e) => setRuc({ ...ruc, nombre_completo: e.target.value })} required />
                </Campo>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Foto titulo="Foto de tu ficha RUC" valor={ficha} onChange={async (x) => { const r = await subir(x); if (r) setFicha(r); }} />
              </div>
            </Tarjeta>
            <Boton variante="secundario" cargando={enviando === "ruc"} disabled={!ficha || ruc.numero.length !== 11}>
              <Building2 className="size-4" /> Enviar RUC para revisión
            </Boton>
          </form>
        )}
      </section>

      <p className="flex items-center gap-2 text-sm text-gris">
        <Lock className="size-4" /> Tus fotos se guardan en un almacenamiento privado y solo las ve el equipo de VendiGo para verificarte.
      </p>
    </div>
  );
}
