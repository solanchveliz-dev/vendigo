"use client";

import { useState } from "react";
import { BookOpen, Printer } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { CabeceraPublica } from "@/components/tienda/cabecera";
import { PieLegal } from "@/components/legal/pie";
import { Area, Aviso, Boton, Campo, Entrada, Selector, cn } from "@/components/ui";

type Proveedor = { razon_social: string; ruc: string; direccion_fiscal: string; correo_soporte: string };
type Hoja = Record<string, string | number | null> & { numero: number; vence_en: string; creado_en: string };

const vacio = {
  nombre: "", documento_tipo: "DNI", documento: "", domicilio: "", telefono: "", email: "", apoderado: "",
  bien_tipo: "producto", monto: "", descripcion_bien: "", pedido_codigo: "", tienda: "",
  tipo: "reclamo", detalle: "", pedido_consumidor: "",
};
const num = (n: number) => String(n).padStart(6, "0");
const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });

// Libro de Reclamaciones virtual (Ley 29571 y D.S. 011-2011-PCM, modificado por D.S. 101-2022-PCM).
// Sin casillas de aceptación obligatorias, como indica Indecopi.
export default function LibroReclamaciones() {
  const { datos: prov } = useApi<Proveedor>("/legal/proveedor");
  const [f, setF] = useState(vacio);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [hoja, setHoja] = useState<{ hoja: Hoja; proveedor: Proveedor } | null>(null);
  const c = (k: keyof typeof vacio) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function enviar() {
    setEnviando(true);
    setError("");
    try {
      const monto = f.monto.trim() ? Math.round(Number(f.monto.replace(",", ".")) * 100) : null;
      const { monto: _m, ...resto } = f;
      void _m;
      const r = await api.post<{ hoja: Hoja; proveedor: Proveedor }>("/libro-reclamaciones", { ...resto, monto_centimos: monto });
      setHoja(r);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setEnviando(false);
    }
  }

  const p = hoja?.proveedor ?? prov;
  const datosProveedor = p && (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      <div><dt className="inline text-gris">Proveedor: </dt><dd className="inline font-semibold text-tinta">{p.razon_social || "VendiGo"}</dd></div>
      <div><dt className="inline text-gris">RUC: </dt><dd className="inline font-semibold text-tinta">{p.ruc || "—"}</dd></div>
      <div className="sm:col-span-2"><dt className="inline text-gris">Dirección: </dt><dd className="inline font-semibold text-tinta">{p.direccion_fiscal || "—"}</dd></div>
    </dl>
  );

  return (
    <div className="min-h-screen bg-crema print:bg-white">
      <div className="print:hidden"><CabeceraPublica /></div>
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-pino text-white"><BookOpen className="size-6" /></span>
          <div>
            <h1 className="text-3xl font-extrabold text-pino">Libro de Reclamaciones</h1>
            <p className="text-sm text-gris">Conforme a lo establecido en el Código de Protección y Defensa del Consumidor.</p>
          </div>
        </div>

        {hoja ? (
          <section className="mt-6 rounded-[22px] bg-white p-6 ring-1 ring-linea/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-coral">Hoja de reclamación</p>
                <p className="font-display text-3xl font-extrabold text-tinta">N.° {num(hoja.hoja.numero)}</p>
                <p className="text-sm text-gris">Registrada el {fechaLarga(hoja.hoja.creado_en)}</p>
              </div>
              <Boton variante="secundario" onClick={() => window.print()} className="print:hidden"><Printer className="size-4" /> Descargar o imprimir</Boton>
            </div>
            <div className="mt-4 rounded-xl bg-crema p-4">{datosProveedor}</div>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["Consumidor", `${hoja.hoja.nombre} · ${hoja.hoja.documento_tipo} ${hoja.hoja.documento}`],
                ["Domicilio", hoja.hoja.domicilio],
                ["Contacto", `${hoja.hoja.telefono} · ${hoja.hoja.email}`],
                ...(hoja.hoja.apoderado ? [["Padre o madre", hoja.hoja.apoderado]] : []),
                ["Bien contratado", `${hoja.hoja.bien_tipo === "producto" ? "Producto" : "Servicio"}: ${hoja.hoja.descripcion_bien}${hoja.hoja.monto_centimos != null ? ` · ${soles(hoja.hoja.monto_centimos as number)}` : ""}`],
                ...(hoja.hoja.pedido_codigo || hoja.hoja.tienda ? [["Pedido / tienda", [hoja.hoja.pedido_codigo, hoja.hoja.tienda].filter(Boolean).join(" · ")]] : []),
                ["Tipo", hoja.hoja.tipo === "reclamo" ? "Reclamo" : "Queja"],
                ["Detalle", hoja.hoja.detalle],
                ["Pedido del consumidor", hoja.hoja.pedido_consumidor],
              ].map(([k, v]) => (
                <div key={String(k)} className="grid gap-1 sm:grid-cols-[170px_1fr]"><dt className="text-gris">{k}</dt><dd className="whitespace-pre-line text-tinta">{String(v)}</dd></div>
              ))}
            </dl>
            <Aviso tono="info" className="mt-5">
              El proveedor debe dar respuesta en un plazo no mayor a quince (15) días hábiles, improrrogable. Te responderemos por escrito a <b>{hoja.hoja.email}</b> a más tardar el <b>{fechaLarga(hoja.hoja.vence_en)}</b>. Guarda el número de tu hoja.
            </Aviso>
            <p className="mt-3 text-xs text-gris">La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</p>
          </section>
        ) : (
          <div className="mt-6 space-y-5">
            <section className="rounded-[22px] bg-white p-6 ring-1 ring-linea/70">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-extrabold text-tinta">Hoja de reclamación virtual</h2>
                <span className="text-sm text-gris">Fecha: {new Date().toLocaleDateString("es-PE")}</span>
              </div>
              <div className="mt-3 rounded-xl bg-crema p-4">{datosProveedor}</div>
            </section>

            <section className="space-y-4 rounded-[22px] bg-white p-6 ring-1 ring-linea/70">
              <h2 className="text-lg font-extrabold text-tinta">1. Identificación del consumidor</h2>
              <Campo etiqueta="Nombre completo"><Entrada value={f.nombre} onChange={c("nombre")} maxLength={120} /></Campo>
              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <Campo etiqueta="Documento">
                  <Selector value={f.documento_tipo} onChange={c("documento_tipo")}><option>DNI</option><option value="CE">Carné de extranjería</option><option>Pasaporte</option></Selector>
                </Campo>
                <Campo etiqueta="Número"><Entrada value={f.documento} onChange={c("documento")} inputMode={f.documento_tipo === "DNI" ? "numeric" : undefined} maxLength={12} /></Campo>
              </div>
              <Campo etiqueta="Domicilio"><Entrada value={f.domicilio} onChange={c("domicilio")} maxLength={200} /></Campo>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Teléfono"><Entrada value={f.telefono} onChange={c("telefono")} inputMode="tel" maxLength={20} /></Campo>
                <Campo etiqueta="Correo" ayuda="Ahí te enviaremos la respuesta."><Entrada type="email" value={f.email} onChange={c("email")} maxLength={120} /></Campo>
              </div>
              <Campo etiqueta="Padre o madre (solo si eres menor de edad)"><Entrada value={f.apoderado} onChange={c("apoderado")} maxLength={120} /></Campo>
            </section>

            <section className="space-y-4 rounded-[22px] bg-white p-6 ring-1 ring-linea/70">
              <h2 className="text-lg font-extrabold text-tinta">2. Identificación del bien contratado</h2>
              <div className="flex gap-2">
                {["producto", "servicio"].map((x) => (
                  <button key={x} onClick={() => setF({ ...f, bien_tipo: x })} className={cn("h-10 rounded-full px-5 text-sm font-semibold ring-1", f.bien_tipo === x ? "bg-pino text-white ring-pino" : "bg-white text-tinta ring-linea")}>
                    {x === "producto" ? "Producto" : "Servicio"}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
                <Campo etiqueta="Descripción"><Entrada value={f.descripcion_bien} onChange={c("descripcion_bien")} maxLength={300} placeholder="Ej. Collar de plata" /></Campo>
                <Campo etiqueta="Monto reclamado (S/)"><Entrada value={f.monto} onChange={c("monto")} inputMode="decimal" placeholder="Opcional" /></Campo>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Código de pedido (si tienes)"><Entrada value={f.pedido_codigo} onChange={c("pedido_codigo")} maxLength={30} placeholder="Ej. VG-10471" /></Campo>
                <Campo etiqueta="Tienda (si aplica)"><Entrada value={f.tienda} onChange={c("tienda")} maxLength={120} /></Campo>
              </div>
            </section>

            <section className="space-y-4 rounded-[22px] bg-white p-6 ring-1 ring-linea/70">
              <h2 className="text-lg font-extrabold text-tinta">3. Detalle de la reclamación</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["reclamo", "Reclamo", "Disconformidad con el producto o servicio."],
                  ["queja", "Queja", "Malestar con la atención, no con el producto o servicio."],
                ].map(([k, t, d]) => (
                  <button key={k} onClick={() => setF({ ...f, tipo: k })} className={cn("rounded-2xl p-4 text-left ring-2", f.tipo === k ? "bg-pino-claro ring-pino" : "bg-white ring-linea/70")}>
                    <b className="block text-tinta">{t}</b>
                    <span className="text-sm text-gris">{d}</span>
                  </button>
                ))}
              </div>
              <Campo etiqueta="Detalle"><Area value={f.detalle} onChange={c("detalle")} rows={5} maxLength={3000} /></Campo>
              <Campo etiqueta="Pedido del consumidor" ayuda="¿Qué solicitas? (cambio, devolución, respuesta, etc.)"><Area value={f.pedido_consumidor} onChange={c("pedido_consumidor")} rows={3} maxLength={1000} /></Campo>
            </section>

            {error && <Aviso tono="error">{error}</Aviso>}
            <p className="text-xs text-gris">El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles, el cual es improrrogable. La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.</p>
            <Boton bloque onClick={enviar} cargando={enviando}>Enviar hoja de reclamación</Boton>
          </div>
        )}
        <div className="print:hidden"><PieLegal className="mt-12 border-t border-linea pt-6" /></div>
      </main>
    </div>
  );
}
