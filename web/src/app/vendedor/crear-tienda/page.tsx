"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Boton, Campo, Entrada, Area, Selector } from "@/components/ui";
import { api, ErrorApi, sesion } from "@/lib/api";
import { ciudades, rubros } from "@/lib/catalogos";

export default function CrearTienda() {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", rubro: "", ciudad: "Lima", distrito: "", descripcion: "", slug: "", instagram: "", facebook: "", tiktok: "", whatsapp: "" });
  const [slug, setSlug] = useState<{ slug: string; disponible: boolean; sugerido: string } | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  // Si en el registro eligió qué vende, el rubro llega ya marcado.
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("rubro");
    if (r && r in rubros) setF((x) => ({ ...x, rubro: r }));
  }, []);
  const cambiar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    const base = f.slug || f.nombre;
    if (base.trim().length < 3) return setSlug(null);
    const t = setTimeout(() => {
      api.get<{ slug: string; disponible: boolean; sugerido: string }>(`/tiendas/slug-disponible?slug=${encodeURIComponent(base)}`).then(setSlug).catch(() => null);
    }, 350);
    return () => clearTimeout(t);
  }, [f.nombre, f.slug]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      await api.post("/tienda", { ...f, slug: slug?.disponible ? slug.slug : slug?.sugerido ?? "" });
      await sesion("renovar");
      router.replace("/vendedor");
    } catch (err) {
      setError((err as ErrorApi).message);
      setCargando(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Image src="/logo.png" alt="" width={40} height={40} />
        <span className="font-display text-xl font-extrabold text-pino">VendiGo</span>
      </div>
      <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
      <h1 className="text-3xl font-extrabold text-pino">Crea tu tienda</h1>
      <p className="mt-1 text-gris">Te toma un minuto. Podrás cambiar todo después.</p>
      <form onSubmit={crear} className="mt-8 space-y-5">
        {error && <Aviso tono="error">{error}</Aviso>}
        <Campo etiqueta="Nombre de tu tienda">
          <Entrada value={f.nombre} onChange={cambiar("nombre")} placeholder="Luna & Sol" maxLength={40} required />
        </Campo>
        {slug && (
          <Aviso tono={slug.disponible ? "ok" : "aviso"}>
            Tu enlace será <b>vendigo.pe/t/{slug.disponible ? slug.slug : slug.sugerido}</b>
            {!slug.disponible && " (el nombre ya estaba en uso)"}
          </Aviso>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Campo etiqueta="¿Qué vendes?">
            <Selector value={f.rubro} onChange={cambiar("rubro")} required>
              <option value="">Elige una opción</option>
              {Object.entries(rubros).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Ciudad">
            <Selector value={f.ciudad} onChange={cambiar("ciudad")}>
              {ciudades.map((c) => <option key={c}>{c}</option>)}
            </Selector>
          </Campo>
        </div>
        <Campo etiqueta="Distrito (opcional)">
          <Entrada value={f.distrito} onChange={cambiar("distrito")} placeholder="Miraflores" />
        </Campo>
        <Campo etiqueta="Cuéntale a tus clientes sobre tu tienda (opcional)" ayuda={`${f.descripcion.length}/300`}>
          <Area value={f.descripcion} onChange={cambiar("descripcion")} maxLength={300} placeholder="Joyería hecha a mano en plata…" />
        </Campo>
        <Campo etiqueta="WhatsApp de la tienda (opcional)">
          <Entrada value={f.whatsapp} onChange={cambiar("whatsapp")} placeholder="987 654 321" inputMode="numeric" />
        </Campo>
        <Boton bloque tamano="lg" variante="acento" cargando={cargando}>
          Crear mi tienda
        </Boton>
        <p className="text-center text-xs text-gris">Empiezas con el plan Gratis: 15 ventas al mes, sin comisión por venta.</p>
      </form>
    </div>
  );
}
