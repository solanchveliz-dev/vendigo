"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Camera } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { ciudades, rubros } from "@/lib/catalogos";
import { subirImagen } from "@/lib/subir";
import type { Tienda } from "@/lib/tipos";
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Area, Selector, Tarjeta, useAvisar } from "@/components/ui";

export default function PerfilTienda() {
  const { datos: t, setDatos } = useApi<Tienda>("/vendedor/tienda");
  const avisar = useAvisar();
  const [f, setF] = useState<Record<string, string>>({});
  const [img, setImg] = useState<{ logo?: { key: string; url: string }; portada?: { key: string; url: string } }>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (t) setF({ nombre: t.nombre, rubro: t.rubro, ciudad: t.ciudad, distrito: t.distrito, descripcion: t.descripcion, instagram: t.instagram, facebook: t.facebook, tiktok: t.tiktok, whatsapp: t.whatsapp });
  }, [t]);
  if (!t || f.nombre === undefined) return <Cargando />;
  const c = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function subir(tipo: "logo" | "portada", file?: File) {
    if (!file) return;
    try {
      const r = await subirImagen(file, tipo);
      setImg((x) => ({ ...x, [tipo]: r }));
    } catch (e) {
      avisar((e as Error).message, "error");
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      setDatos(await api.put<Tienda>("/vendedor/tienda", { ...f, logo_key: img.logo?.key ?? null, portada_key: img.portada?.key ?? null }));
      avisar("Perfil actualizado.");
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  const portada = img.portada?.url ?? t.portada_url;
  const logo = img.logo?.url ?? t.logo_url;

  return (
    <div className="max-w-3xl">
      <Link href="/vendedor/tienda" className="inline-flex items-center gap-1 text-sm font-semibold text-pino">
        <ArrowLeft className="size-4" /> Mi tienda
      </Link>
      <Encabezado titulo="Editar perfil" detalle="Es lo primero que ven tus clientes." />
      <form onSubmit={guardar} className="space-y-5">
        {error && <Aviso tono="error">{error}</Aviso>}
        <Tarjeta className="overflow-hidden p-0">
          <label className="relative block h-40 cursor-pointer bg-pino bg-cover bg-center" style={portada ? { backgroundImage: `url(${portada})` } : undefined}>
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-pino">
              <Camera className="size-4" /> Cambiar portada
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => subir("portada", e.target.files?.[0])} />
          </label>
          <div className="flex items-end gap-4 px-5 pb-5">
            <label className="relative -mt-10 size-24 cursor-pointer overflow-hidden rounded-2xl bg-crema ring-4 ring-white">
              {logo ? <img src={logo} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center text-pino"><Camera className="size-6" /></span>}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => subir("logo", e.target.files?.[0])} />
            </label>
            <p className="pb-2 text-sm text-gris">Toca el logo o la portada para cambiarlos.</p>
          </div>
        </Tarjeta>
        <Tarjeta className="space-y-4">
          <Campo etiqueta="Nombre de la tienda">
            <Entrada value={f.nombre} onChange={c("nombre")} maxLength={40} required />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo etiqueta="Rubro">
              <Selector value={f.rubro} onChange={c("rubro")}>
                {Object.entries(rubros).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Ciudad">
              <Selector value={f.ciudad} onChange={c("ciudad")}>
                {ciudades.map((x) => <option key={x}>{x}</option>)}
              </Selector>
            </Campo>
            <Campo etiqueta="Distrito">
              <Entrada value={f.distrito} onChange={c("distrito")} />
            </Campo>
          </div>
          <Campo etiqueta="Descripción" ayuda={`${f.descripcion?.length ?? 0}/300`}>
            <Area value={f.descripcion} onChange={c("descripcion")} maxLength={300} />
          </Campo>
        </Tarjeta>
        <Tarjeta className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Instagram"><Entrada value={f.instagram} onChange={c("instagram")} placeholder="@tutienda o pega tu enlace" /></Campo>
          <Campo etiqueta="TikTok"><Entrada value={f.tiktok} onChange={c("tiktok")} placeholder="@tutienda o pega tu enlace" /></Campo>
          <Campo etiqueta="Facebook"><Entrada value={f.facebook} onChange={c("facebook")} placeholder="tutienda o pega tu enlace" /></Campo>
          <Campo etiqueta="WhatsApp" ayuda="No se muestra a tus clientes. Solo lo usamos para avisarte de tus pedidos.">
            <Entrada value={f.whatsapp} onChange={c("whatsapp")} inputMode="numeric" placeholder="987 654 321" />
          </Campo>
        </Tarjeta>
        <Boton variante="acento" tamano="lg" cargando={guardando}>
          Guardar cambios
        </Boton>
      </form>
    </div>
  );
}
