"use client";

import Link from "next/link";
import { useState } from "react";
import { Camera, ChevronRight, Clock, Lock, ShieldCheck } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha } from "@/lib/formato";
import { subirImagen } from "@/lib/subir";
import { Aviso, Boton, Campo, Cargando, Entrada, Selector, Tarjeta, useAvisar } from "@/components/ui";

type Estado = { estado: string; tipo_documento?: string; ultimos4?: string; nombre_completo?: string; motivo_rechazo?: string; creado_en?: string };

function Foto({ titulo, valor, onChange }: { titulo: string; valor: { key: string; url: string } | null; onChange: (f: File) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-linea bg-white p-4 text-center">
      {valor ? <img src={valor.url} alt="" className="h-28 rounded-lg object-cover" /> : <Camera className="size-7 text-pino" />}
      <span className="text-sm font-semibold text-pino">{titulo}</span>
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])} />
    </label>
  );
}

export default function Verificacion() {
  const { datos, setDatos } = useApi<Estado>("/vendedor/verificacion");
  const avisar = useAvisar();
  const [f, setF] = useState({ tipo_documento: "dni", numero: "", nombre_completo: "" });
  const [fotos, setFotos] = useState<Record<string, { key: string; url: string } | null>>({ frente: null, reverso: null, selfie: null });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!datos) return <Cargando />;

  async function subir(k: string, file: File) {
    try {
      const r = await subirImagen(file, "dni");
      setFotos((x) => ({ ...x, [k]: r }));
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      setDatos(await api.post<Estado>("/vendedor/verificacion", { ...f, frente_key: fotos.frente?.key ?? "", reverso_key: fotos.reverso?.key ?? "", selfie_key: fotos.selfie?.key ?? "" }));
      avisar("Enviado. Revisamos tu identidad en menos de 24 horas.");
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/cobros" className="hover:text-pino">Mis cobros</Link> <ChevronRight className="size-3.5" /> Identidad
      </p>
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Verifica tu identidad</h1>
        <p className="text-sm text-gris">Necesaria para retirar tu dinero. Así nadie puede usar tu tienda para estafar. Se hace una sola vez.</p>
      </div>
      {datos.estado === "aprobada" ? (
        <div className="flex items-center gap-4 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <span className="grid size-11 place-items-center rounded-xl bg-pino-claro text-pino"><ShieldCheck className="size-5" /></span>
          <div>
            <p className="font-display text-lg font-extrabold text-tinta">Identidad verificada</p>
            <p className="text-sm text-gris">
              {datos.nombre_completo} · {datos.tipo_documento?.toUpperCase()} •••• {datos.ultimos4} · desde el {fecha(datos.creado_en)}. Ya puedes retirar tu dinero.
            </p>
          </div>
        </div>
      ) : datos.estado === "pendiente" ? (
        <div className="flex items-center gap-4 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <span className="grid size-11 place-items-center rounded-xl bg-aviso-claro text-aviso"><Clock className="size-5" /></span>
          <div>
            <p className="font-display text-lg font-extrabold text-tinta">Estamos revisando tus datos</p>
            <p className="text-sm text-gris">Enviado el {fecha(datos.creado_en, true)}. El equipo de VendiGo te avisa en menos de 24 horas.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          {datos.estado === "rechazada" && <Aviso tono="error">No pudimos verificar tus datos: {datos.motivo_rechazo}. Inténtalo de nuevo.</Aviso>}
          {error && <Aviso tono="error">{error}</Aviso>}
          <Tarjeta className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <Campo etiqueta="Documento">
                <Selector value={f.tipo_documento} onChange={(e) => setF({ ...f, tipo_documento: e.target.value })}>
                  <option value="dni">DNI</option>
                  <option value="ce">Carné de extranjería</option>
                  <option value="ruc">RUC</option>
                </Selector>
              </Campo>
              <Campo etiqueta="Número">
                <Entrada value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} inputMode="numeric" required />
              </Campo>
            </div>
            <Campo etiqueta="Nombre completo (como figura en tu documento)">
              <Entrada value={f.nombre_completo} onChange={(e) => setF({ ...f, nombre_completo: e.target.value })} required />
            </Campo>
            <div className="grid gap-3 sm:grid-cols-3">
              <Foto titulo="Documento: frente" valor={fotos.frente} onChange={(x) => subir("frente", x)} />
              <Foto titulo="Documento: reverso" valor={fotos.reverso} onChange={(x) => subir("reverso", x)} />
              <Foto titulo="Selfie con tu documento" valor={fotos.selfie} onChange={(x) => subir("selfie", x)} />
            </div>
          </Tarjeta>
          <p className="flex items-center gap-2 text-sm text-gris">
            <Lock className="size-4" /> Tus fotos se guardan cifradas y solo las ve el equipo de VendiGo para verificarte.
          </p>
          <Boton variante="acento" cargando={enviando} disabled={!fotos.frente || !fotos.selfie}>
            <ShieldCheck className="size-4" /> Enviar para revisión
          </Boton>
        </form>
      )}
    </div>
  );
}
