"use client";

import { useState } from "react";
import { Camera, CheckCircle2, Clock, Lock, ShieldCheck } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha } from "@/lib/formato";
import { subirImagen } from "@/lib/subir";
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Selector, Tarjeta, useAvisar } from "@/components/ui";

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
    <div className="max-w-2xl">
      <Encabezado titulo="Verificar identidad" detalle="La pedimos una sola vez para que puedas retirar tu dinero. Protege a tus clientes y a ti." />
      {datos.estado === "aprobada" ? (
        <Tarjeta className="flex items-center gap-4">
          <CheckCircle2 className="size-10 text-ok" />
          <div>
            <p className="font-semibold">Identidad verificada</p>
            <p className="text-sm text-gris">
              {datos.nombre_completo} · {datos.tipo_documento?.toUpperCase()} •••• {datos.ultimos4}
            </p>
          </div>
        </Tarjeta>
      ) : datos.estado === "pendiente" ? (
        <Tarjeta className="flex items-center gap-4">
          <Clock className="size-10 text-aviso" />
          <div>
            <p className="font-semibold">Estamos revisando tus datos</p>
            <p className="text-sm text-gris">Enviado el {fecha(datos.creado_en, true)}. Te avisamos en menos de 24 horas.</p>
          </div>
        </Tarjeta>
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
