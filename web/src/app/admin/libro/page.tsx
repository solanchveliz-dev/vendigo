"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { fecha, fechaHora } from "@/lib/admin";
import { Area, Boton, Cargando, cn, useAvisar } from "@/components/ui";
import { Estado, Titulo, useExportar } from "@/components/admin/ui";

type Hoja = {
  numero: number; nombre: string; documento_tipo: string; documento: string; domicilio: string; telefono: string; email: string; apoderado: string;
  bien_tipo: string; monto_centimos: number | null; descripcion_bien: string; pedido_codigo: string; tienda: string;
  tipo: string; detalle: string; pedido_consumidor: string; respuesta: string; respondida_en: string | null; vence_en: string; creado_en: string;
};
const num = (n: number) => String(n).padStart(6, "0");

function plazo(h: Hoja) {
  if (h.respondida_en) return { t: "Respondida", tono: "ok" as const };
  const dias = Math.ceil((new Date(h.vence_en).getTime() - Date.now()) / 86400000);
  if (dias < 0) return { t: "Plazo vencido", tono: "error" as const };
  return { t: dias <= 3 ? `Vence en ${dias} día${dias === 1 ? "" : "s"}` : `Vence el ${fecha(h.vence_en)}`, tono: dias <= 3 ? ("error" as const) : ("aviso" as const) };
}

export default function Libro() {
  const avisar = useAvisar();
  const { datos, recargar } = useApi<{ hojas: Hoja[] }>("/admin/libro");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);

  useExportar("libro-reclamaciones", () => [
    ["N.°", "Fecha", "Consumidor", "Documento", "Correo", "Tipo", "Bien", "Pedido", "Tienda", "Detalle", "Pedido del consumidor", "Respuesta", "Respondida", "Vence"],
    ...(datos?.hojas ?? []).map((h) => [num(h.numero), fechaHora(h.creado_en), h.nombre, `${h.documento_tipo} ${h.documento}`, h.email, h.tipo, h.descripcion_bien, h.pedido_codigo, h.tienda, h.detalle, h.pedido_consumidor, h.respuesta, fechaHora(h.respondida_en), fecha(h.vence_en)]),
  ]);

  async function responder(n: number) {
    setEnviando(true);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/libro/${n}/responder`, { respuesta });
      avisar(r.mensaje);
      setRespuesta("");
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Titulo titulo="Libro de Reclamaciones" detalle="Hojas registradas en el libro virtual. Cada una debe responderse por escrito en máximo 15 días hábiles." />
      {!datos ? (
        <Cargando />
      ) : !datos.hojas.length ? (
        <p className="rounded-[22px] bg-white p-6 text-sm text-gris ring-1 ring-linea/70">Todavía no hay hojas de reclamación.</p>
      ) : (
        <section className="divide-y divide-linea overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
          {datos.hojas.map((h) => {
            const p = plazo(h);
            const ver = abierta === h.numero;
            return (
              <div key={h.numero}>
                <button onClick={() => { setAbierta(ver ? null : h.numero); setRespuesta(""); }} className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left hover:bg-crema/40">
                  <b className="w-24 text-tinta">N.° {num(h.numero)}</b>
                  <span className="min-w-0 flex-1">
                    <b className="block text-sm text-tinta">{h.nombre}</b>
                    <span className="text-xs text-gris">{h.tipo === "reclamo" ? "Reclamo" : "Queja"} · {h.descripcion_bien} · {fecha(h.creado_en)}</span>
                  </span>
                  <Estado tono={p.tono}>{p.t}</Estado>
                  <ChevronDown className={cn("size-4 text-tinta transition", ver && "rotate-180")} />
                </button>
                {ver && (
                  <div className="space-y-4 bg-crema/30 px-5 pb-5 pt-1">
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      {[
                        ["Documento", `${h.documento_tipo} ${h.documento}`],
                        ["Contacto", `${h.telefono} · ${h.email}`],
                        ["Domicilio", h.domicilio],
                        ...(h.apoderado ? [["Padre o madre", h.apoderado]] : []),
                        ["Bien", `${h.bien_tipo === "producto" ? "Producto" : "Servicio"}${h.monto_centimos != null ? ` · ${soles(h.monto_centimos)}` : ""}`],
                        ["Pedido / tienda", [h.pedido_codigo, h.tienda].filter(Boolean).join(" · ") || "—"],
                      ].map(([k, v]) => (
                        <div key={k}><dt className="text-gris">{k}</dt><dd className="text-tinta">{v}</dd></div>
                      ))}
                    </dl>
                    <div><p className="text-sm text-gris">Detalle</p><p className="whitespace-pre-line text-[15px] text-tinta">{h.detalle}</p></div>
                    <div><p className="text-sm text-gris">Pedido del consumidor</p><p className="whitespace-pre-line text-[15px] text-tinta">{h.pedido_consumidor}</p></div>
                    {h.respondida_en ? (
                      <div className="rounded-xl bg-ok-claro p-4"><p className="text-sm font-bold text-ok">Respuesta · {fechaHora(h.respondida_en)}</p><p className="mt-1 whitespace-pre-line text-[15px] text-tinta">{h.respuesta}</p></div>
                    ) : (
                      <div>
                        <Area value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={4} maxLength={3000} placeholder={`Respuesta por escrito para ${h.email}…`} />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <a href={`mailto:${h.email}?subject=${encodeURIComponent(`Respuesta a su hoja de reclamación N.° ${num(h.numero)}`)}&body=${encodeURIComponent(respuesta)}`} className="text-sm font-semibold text-pino underline">Abrir correo con esta respuesta</a>
                          <Boton onClick={() => responder(h.numero)} cargando={enviando} disabled={respuesta.trim().length < 10}>Registrar respuesta</Boton>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
