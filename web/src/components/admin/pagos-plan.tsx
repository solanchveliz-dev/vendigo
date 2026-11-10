"use client";

import { useState } from "react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { fechaHora } from "@/lib/admin";
import { Area, Boton, Campo, Entrada, Modal, useAvisar } from "@/components/ui";
import { Estado, Tarjeta } from "@/components/admin/ui";

type PagoPlan = {
  id: string;
  tienda_id: string;
  tienda: string;
  concepto: string;
  tipo: "plan" | "ventas_extra";
  monto_centimos: number;
  estado: "pendiente" | "confirmado" | "rechazado";
  referencia: string;
  referencia_tienda: string;
  motivo_rechazo: string;
  creado_en: string;
  confirmado_en: string | null;
};

const ESTADO = {
  pendiente: { t: "Por confirmar", tono: "aviso" as const },
  confirmado: { t: "Confirmado", tono: "ok" as const },
  rechazado: { t: "Rechazado", tono: "error" as const },
};

// Pagos que las tiendas hacen a VendiGo por su plan. Se revisan contra el Yape de VendiGo
// y recién al confirmar se activa el plan o el paquete de ventas.
export function PagosPlan() {
  const { datos, recargar } = useApi<{ pagos: PagoPlan[] }>("/admin/pagos-plan");
  const [abrir, setAbrir] = useState<{ p: PagoPlan; accion: "confirmar" | "rechazar" } | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [todos, setTodos] = useState(false);
  const avisar = useAvisar();

  async function enviar() {
    if (!abrir) return;
    setEnviando(true);
    try {
      const cuerpo = abrir.accion === "confirmar" ? { referencia: texto.trim() } : { motivo: texto.trim() };
      const r = await api.post<{ mensaje: string }>(`/admin/pagos-plan/${abrir.p.id}/${abrir.accion}`, cuerpo);
      avisar(r.mensaje);
      setAbrir(null);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const pagos = datos?.pagos ?? [];
  const pendientes = pagos.filter((p) => p.estado === "pendiente");
  const lista = todos ? pagos.slice(0, 30) : pendientes;

  return (
    <Tarjeta
      titulo={`Pagos de planes por confirmar (${pendientes.length})`}
      accion={
        <button onClick={() => setTodos(!todos)} className="text-sm font-semibold text-pino">
          {todos ? "Ver solo pendientes" : "Ver historial"}
        </button>
      }
    >
      <p className="mb-3 text-sm text-gris">Revisa en el Yape de VendiGo que el pago llegó. Al confirmar se activa el plan o el paquete de ventas.</p>
      {!datos ? (
        <p className="text-sm text-gris">Cargando…</p>
      ) : !lista.length ? (
        <p className="text-sm text-gris">{todos ? "Todavía no hay pagos de planes." : "No hay pagos por confirmar."}</p>
      ) : (
        lista.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-linea py-3 text-sm last:border-0">
            <span className="min-w-0 flex-1">
              <b className="block text-tinta">{p.tienda}</b>
              <span className="text-xs text-gris">
                {p.concepto} · {fechaHora(p.creado_en)}
                {p.referencia ? ` · Op. ${p.referencia}` : p.referencia_tienda ? ` · La tienda indica Op. ${p.referencia_tienda}` : ""}
                {p.motivo_rechazo && ` · ${p.motivo_rechazo}`}
              </span>
            </span>
            <b className="text-tinta">{soles(p.monto_centimos)}</b>
            <Estado tono={ESTADO[p.estado].tono}>{ESTADO[p.estado].t}</Estado>
            {p.estado === "pendiente" && (
              <span className="flex gap-2">
                <Boton tamano="sm" variante="secundario" onClick={() => { setTexto(""); setAbrir({ p, accion: "rechazar" }); }}>Rechazar</Boton>
                <Boton tamano="sm" onClick={() => { setTexto(p.referencia_tienda ?? ""); setAbrir({ p, accion: "confirmar" }); }}>Confirmar</Boton>
              </span>
            )}
          </div>
        ))
      )}

      <Modal abierto={!!abrir} onCerrar={() => setAbrir(null)} titulo={abrir?.accion === "confirmar" ? "Confirmar pago" : "Rechazar pago"}>
        {abrir && (
          <div className="space-y-4">
            <p className="text-sm text-gris">
              {abrir.p.tienda} · {abrir.p.concepto} · <b className="text-tinta">{soles(abrir.p.monto_centimos)}</b>
            </p>
            {abrir.accion === "confirmar" ? (
              <Campo etiqueta="Número de operación de Yape" ayuda="Compáralo con el movimiento recibido en el Yape de VendiGo antes de confirmar.">
                <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={40} placeholder="Ej. 12345678" />
              </Campo>
            ) : (
              <Area value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="¿Por qué se rechaza? (lo verá la tienda)" maxLength={300} />
            )}
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setAbrir(null)}>Cancelar</Boton>
              <Boton
                variante={abrir.accion === "confirmar" ? "primario" : "peligro"}
                onClick={enviar}
                cargando={enviando}
                disabled={abrir.accion === "confirmar" ? texto.trim().length < 4 : texto.trim().length < 5}
              >
                {abrir.accion === "confirmar" ? "Confirmar y activar" : "Rechazar pago"}
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </Tarjeta>
  );
}
