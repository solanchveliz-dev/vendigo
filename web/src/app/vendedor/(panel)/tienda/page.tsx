"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bike, Check, Copy, Eye, Image as Imagen, Loader2, Package, QrCode, Store, Upload } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { ciudades, rubros } from "@/lib/catalogos";
import { soles } from "@/lib/formato";
import { subirImagen } from "@/lib/subir";
import type { Tienda } from "@/lib/tipos";
import { Area, Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Selector, Tarjeta, useAvisar } from "@/components/ui";

type Img = { key: string; url: string };

// "Tu tienda": todo en una sola página, igual que en el prototipo.
export default function TuTienda() {
  const { datos: t, setDatos } = useApi<Tienda>("/vendedor/tienda");
  const avisar = useAvisar();
  const [f, setF] = useState<Record<string, string> | null>(null);
  const [img, setImg] = useState<{ logo?: Img; portada?: Img }>({});
  const [subiendo, setSubiendo] = useState<"" | "logo" | "portada">("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (t && !f)
      setF({
        nombre: t.nombre, rubro: t.rubro, descripcion: t.descripcion, ciudad: t.ciudad, distrito: t.distrito, whatsapp: t.whatsapp,
        correo: t.correo, horario: t.horario || t.entrega.horario_recojo, instagram: t.instagram, tiktok: t.tiktok, facebook: t.facebook, politicas: t.politicas,
      });
  }, [t, f]);
  if (!t || !f) return <Cargando />;
  const c = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const logo = img.logo?.url ?? t.logo_url;
  const portada = img.portada?.url ?? t.portada_url;

  // Qué tan completa está la tienda y qué le falta primero
  const pasos: [boolean, string][] = [
    [!!f.nombre.trim(), "el nombre"],
    [!!f.descripcion.trim(), "una descripción corta"],
    [!!logo, "tu logo"],
    [!!f.whatsapp.trim(), "tu WhatsApp"],
    [!!f.distrito.trim(), "tu distrito"],
    [!!f.horario.trim(), "tu horario de atención"],
    [!!(f.instagram.trim() || f.tiktok.trim() || f.facebook.trim()), "al menos una red social"],
    [!!f.politicas.trim(), "tu política de cambios"],
    [!!portada, "una portada para verse mejor en “Explorar tiendas”"],
  ];
  const pct = Math.round((pasos.filter(([ok]) => ok).length / pasos.length) * 100);
  const falta = pasos.find(([ok]) => !ok)?.[1];

  async function subir(tipo: "logo" | "portada", file?: File) {
    if (!file) return;
    setSubiendo(tipo);
    try {
      const r = await subirImagen(file, tipo);
      setImg((x) => ({ ...x, [tipo]: r }));
      avisar(tipo === "logo" ? "Logo listo. Guarda los cambios." : "Portada lista. Guarda los cambios.");
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setSubiendo("");
    }
  }

  async function guardar() {
    setError("");
    if (!f!.nombre.trim() || !f!.descripcion.trim() || !f!.whatsapp.trim() || !f!.distrito.trim() || !f!.horario.trim()) {
      setError("Completa lo esencial: nombre, descripción, WhatsApp, distrito y horario.");
      avisar("Revisa los campos marcados", "error");
      return;
    }
    setGuardando(true);
    try {
      const nueva = await api.put<Tienda>("/vendedor/tienda", { ...f, logo_key: img.logo?.key ?? null, portada_key: img.portada?.key ?? null });
      setDatos(nueva);
      setImg({});
      avisar("Cambios guardados. Tu tienda ya está actualizada");
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(t!.enlace);
    avisar("Enlace copiado");
  }

  const vacio = (k: string) => (error && !f[k]?.trim() ? "Este dato es necesario" : undefined);
  const e = t.entrega;

  return (
    <div>
      <Encabezado titulo="Tu tienda" detalle="Completa lo esencial primero. Todo lo marcado como opcional puedes llenarlo después.">
        <Link href="/vendedor/tienda/vista">
          <Boton variante="secundario"><Eye className="size-4" /> Vista previa</Boton>
        </Link>
        <Boton onClick={guardar} cargando={guardando}>Guardar cambios</Boton>
      </Encabezado>

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-pino-claro px-4 py-3 text-pino">
        <Check className="size-5 shrink-0" />
        <p className="min-w-0 flex-1 text-sm">
          <b>Tu tienda está {pct}% completa.</b> {falta ? `Te falta agregar ${falta}.` : "¡Está lista para recibir clientes!"}
        </p>
        <Link href="/vendedor/tienda/compartir">
          <Boton tamano="sm">Compartir tienda</Boton>
        </Link>
      </div>

      {error && <Aviso tono="error" className="mb-5">{error}</Aviso>}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Tarjeta className="space-y-4">
            <h3 className="text-lg font-extrabold text-tinta">Lo esencial</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre de la tienda" error={vacio("nombre")}>
                <Entrada value={f.nombre} onChange={c("nombre")} maxLength={40} />
              </Campo>
              <Campo etiqueta="Categoría">
                <Selector value={f.rubro} onChange={c("rubro")}>
                  {Object.entries(rubros).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Selector>
              </Campo>
            </div>
            <Campo etiqueta="Descripción corta" ayuda="Cuenta qué vendes y qué te hace especial. 2 o 3 líneas bastan." error={vacio("descripcion")}>
              <Area value={f.descripcion} onChange={c("descripcion")} maxLength={300} rows={3} />
            </Campo>
          </Tarjeta>

          <Tarjeta className="space-y-4">
            <h3 className="text-lg font-extrabold text-tinta">Logo y portada</h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-tinta">Logo</span>
                <div className="flex items-center gap-3">
                  <span className="size-[72px] shrink-0 overflow-hidden rounded-full bg-crema ring-1 ring-linea">
                    {logo ? <img src={logo} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center font-display text-2xl font-extrabold text-pino">{f.nombre[0]}</span>}
                  </span>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold ring-1 ring-linea hover:bg-crema">
                    {subiendo === "logo" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Cambiar logo
                    <input type="file" accept="image/*" className="hidden" onChange={(ev) => subir("logo", ev.target.files?.[0])} />
                  </label>
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-tinta">Portada <span className="font-normal text-gris">(opcional)</span></span>
                <label
                  className="grid h-28 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-linea bg-crema/60 bg-cover bg-center text-center text-gris hover:border-pino/40"
                  style={portada ? { backgroundImage: `url(${portada})` } : undefined}
                >
                  {!portada && (
                    <span>
                      {subiendo === "portada" ? <Loader2 className="mx-auto size-6 animate-spin" /> : <Imagen className="mx-auto size-6" />}
                      <b className="mt-1 block text-sm text-tinta">Sube una imagen horizontal</b>
                      <span className="text-xs">JPG o PNG, mínimo 1200 px de ancho</span>
                    </span>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={(ev) => subir("portada", ev.target.files?.[0])} />
                </label>
              </div>
            </div>
          </Tarjeta>

          <Tarjeta className="space-y-4">
            <h3 className="text-lg font-extrabold text-tinta">Contacto y ubicación</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="WhatsApp" ayuda="No se muestra a tus clientes. Solo lo usamos para avisarte de tus pedidos." error={vacio("whatsapp")}>
                <div className="flex items-center rounded-xl bg-white ring-1 ring-linea focus-within:ring-pino">
                  <span className="border-r border-linea px-3 text-sm text-gris">+51</span>
                  <input value={f.whatsapp} onChange={c("whatsapp")} inputMode="numeric" placeholder="987 654 321" className="w-full bg-transparent px-3 py-2.5 text-sm outline-none" />
                </div>
              </Campo>
              <Campo etiqueta="Correo de contacto">
                <Entrada type="email" value={f.correo} onChange={c("correo")} placeholder="tutienda@correo.com" />
              </Campo>
              <Campo etiqueta="Distrito y ciudad" error={vacio("distrito")}>
                <div className="flex gap-2">
                  <Entrada value={f.distrito} onChange={c("distrito")} placeholder="Distrito" />
                  <Selector value={f.ciudad} onChange={c("ciudad")} className="w-36">
                    {ciudades.map((x) => <option key={x}>{x}</option>)}
                  </Selector>
                </div>
              </Campo>
              <Campo etiqueta="Horario de atención" error={vacio("horario")}>
                <Entrada value={f.horario} onChange={c("horario")} placeholder="Lun a sáb · 10:00 – 19:00" maxLength={80} />
              </Campo>
            </div>
          </Tarjeta>

          <Tarjeta className="space-y-4">
            <h3 className="text-lg font-extrabold text-tinta">Redes sociales</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo etiqueta="Instagram (opcional)"><Entrada value={f.instagram} onChange={c("instagram")} placeholder="@tutienda o pega tu enlace" /></Campo>
              <Campo etiqueta="TikTok (opcional)"><Entrada value={f.tiktok} onChange={c("tiktok")} placeholder="@tutienda o pega tu enlace" /></Campo>
              <Campo etiqueta="Facebook (opcional)"><Entrada value={f.facebook} onChange={c("facebook")} placeholder="tutienda o pega tu enlace" /></Campo>
            </div>
          </Tarjeta>

          <Tarjeta className="space-y-4">
            <h3 className="text-lg font-extrabold text-tinta">Políticas</h3>
            <Campo etiqueta="Cambios y devoluciones (opcional)" ayuda="Escríbelo como se lo explicarías a un cliente.">
              <Area value={f.politicas} onChange={c("politicas")} maxLength={600} rows={3} placeholder="Ej. Cambios dentro de 7 días con empaque original." />
            </Campo>
          </Tarjeta>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <Tarjeta>
            <h3 className="mb-3 text-lg font-extrabold text-tinta">Entrega</h3>
            <ul className="space-y-3">
              {e.recojo && <FilaEntrega icono={<Store className="size-4" />} titulo="Recojo en tienda" texto={e.direccion_recojo || "Falta la dirección"} />}
              {e.agencia && <FilaEntrega icono={<Package className="size-4" />} titulo="Envío por agencia" texto={e.agencias.join(", ")} />}
              {e.motorizado && (
                <FilaEntrega icono={<Bike className="size-4" />} titulo="Delivery con motorizado" texto={`${e.zonas_motorizado || "Zonas cercanas"}${e.costo_motorizado_centimos ? ` · ${soles(e.costo_motorizado_centimos)}` : ""}`} />
              )}
            </ul>
            <Link href="/vendedor/tienda/entrega">
              <Boton variante="secundario" tamano="sm" bloque className="mt-4">Configurar entrega</Boton>
            </Link>
          </Tarjeta>
          <Tarjeta>
            <h3 className="mb-2 text-lg font-extrabold text-tinta">Tu enlace</h3>
            <p className="break-all text-sm font-bold text-pino">{t.enlace.replace(/^https?:\/\//, "")}</p>
            <div className="mt-3 flex gap-2">
              <Boton variante="secundario" tamano="sm" onClick={copiar}><Copy className="size-4" /> Copiar</Boton>
              <Link href="/vendedor/tienda/compartir">
                <Boton variante="secundario" tamano="sm"><QrCode className="size-4" /> QR</Boton>
              </Link>
            </div>
          </Tarjeta>
        </aside>
      </div>
    </div>
  );
}

function FilaEntrega({ icono, titulo, texto }: { icono: React.ReactNode; titulo: string; texto: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-arena text-pino">{icono}</span>
      <span className="min-w-0">
        <b className="block text-sm text-tinta">{titulo}</b>
        <span className="block text-xs text-gris">{texto}</span>
      </span>
    </li>
  );
}
