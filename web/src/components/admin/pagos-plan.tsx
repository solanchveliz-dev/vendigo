"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { fechaHora } from "@/lib/admin";
import { Area, Boton, Campo, Entrada, Modal, cn, useAvisar } from "@/components/ui";
import { Estado, Tarjeta } from "@/components/admin/ui";
import { METODOS, TIPO_COBRO } from "@/lib/pagos-plan";

type PagoPlan = {
  id: string;
  tienda_id: string;
  tienda: string;
  concepto: string;
  tipo: "plan" | "ventas_extra" | "destacado" | "creditos_ia" | "proteccion";
  monto_centimos: number;
  estado: "pendiente" | "confirmado" | "rechazado" | "de_prueba";
  referencia: string;
  referencia_tienda: string;
  metodo: string;
  motivo_rechazo: string;
  creado_en: string;
  confirmado_en: string | null;
};

const TIPOS = ["plan", "ventas_extra", "destacado", "creditos_ia"] as const;
const POR_PAGINA = 15;

// Cobrado por Culqi pero no se llegó a activar (caso raro): es lo único que el admin revisa a mano.
const sinActivar = (p: PagoPlan) => p.estado === "pendiente" && p.referencia_tienda.startsWith("chr_");

function estadoDe(p: PagoPlan): { t: string; tono: "ok" | "aviso" | "error" | "neutro" } {
  if (p.estado === "confirmado") return { t: p.monto_centimos ? "Pagado" : "Gratis", tono: "ok" };
  if (p.estado === "rechazado") return { t: "Rechazado", tono: "error" };
  if (p.estado === "de_prueba") return { t: "De prueba", tono: "neutro" };
  if (sinActivar(p)) return { t: "Cobrado, sin activar", tono: "aviso" };
  if (p.referencia_tienda) return { t: "Aviso manual antiguo", tono: "neutro" };
  return { t: "Sin pagar", tono: "neutro" };
}

// Cobros de VendiGo: lo que las tiendas le pagan a VendiGo con Culqi (plan, ventas extra, impulsos y créditos de IA).
// Todo se activa solo en cuanto Culqi aprueba el cobro; el admin no confirma pagos.
export function PagosPlan() {
  const { datos, recargar } = useApi<{ pagos: PagoPlan[] }>("/admin/pagos-plan");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number] | "">("");
  const [todos, setTodos] = useState(false);
  const [abrir, setAbrir] = useState<{ p: PagoPlan; accion: "confirmar" | "rechazar" } | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
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
  const porRevisar = pagos.filter(sinActivar);
  const delTipo = tipo ? pagos.filter((p) => p.tipo === tipo) : pagos;
  const lista = todos ? delTipo : delTipo.slice(0, POR_PAGINA);
  const cobrado = (t?: string) => pagos.filter((p) => p.estado === "confirmado" && (!t || p.tipo === t)).reduce((s, p) => s + p.monto_centimos, 0);

  const fila = (p: PagoPlan, acciones: boolean) => {
    const e = estadoDe(p);
    const tipoCobro = TIPO_COBRO[p.tipo] ?? { t: p.tipo, d: "" };
    return (
      <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-linea py-3 text-sm last:border-0">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <b className="text-tinta">{p.tienda}</b>
            <span className="rounded-full bg-pino-claro px-2 py-0.5 text-xs font-bold text-pino" title={tipoCobro.d}>{tipoCobro.t}</span>
          </span>
          <span className="text-xs text-gris">
            {p.concepto} · {fechaHora(p.creado_en)}
            {p.estado === "confirmado" && p.referencia ? ` · ${p.metodo === "culqi" ? "Culqi" : METODOS[p.metodo] ?? p.metodo} ${p.referencia}` : ""}
            {sinActivar(p) && ` · Cobro de Culqi ${p.referencia_tienda}`}
            {p.motivo_rechazo && ` · ${p.motivo_rechazo}`}
          </span>
        </span>
        <b className="text-tinta">{soles(p.monto_centimos)}</b>
        <Estado tono={e.tono}>{e.t}</Estado>
        {acciones && p.estado === "pendiente" && (
          <span className="flex gap-2">
            <Boton tamano="sm" variante="secundario" onClick={() => { setTexto(""); setAbrir({ p, accion: "rechazar" }); }}>Rechazar</Boton>
            {sinActivar(p) && <Boton tamano="sm" onClick={() => { setTexto(p.referencia_tienda); setAbrir({ p, accion: "confirmar" }); }}>Activar</Boton>}
          </span>
        )}
      </div>
    );
  };

  return (
    <Tarjeta
      titulo="Cobros de VendiGo"
      accion={
        delTipo.length > POR_PAGINA ? (
          <button onClick={() => setTodos(!todos)} className="text-sm font-semibold text-pino">{todos ? "Ver menos" : `Ver todos (${delTipo.length})`}</button>
        ) : undefined
      }
    >
      <p className="mb-4 text-sm text-gris">
        Lo que las tiendas le pagan a VendiGo con Culqi (tarjeta o Yape). Cada compra se activa sola en cuanto Culqi aprueba el cobro: no hay que confirmar nada.
      </p>

      {porRevisar.length > 0 && (
        <div className="mb-4 rounded-2xl bg-aviso-claro/70 p-4 ring-1 ring-aviso/20">
          <p className="flex items-center gap-2 font-bold text-tinta">
            <AlertTriangle className="size-4 text-aviso" /> Cobrados por Culqi que no se activaron ({porRevisar.length})
          </p>
          <p className="mt-1 text-xs text-gris">Culqi cobró, pero algo falló al activar la compra. Verifica el cobro en el panel de Culqi y actívalo, o recházalo y devuelve el dinero desde Culqi.</p>
          <div className="mt-2">{porRevisar.map((p) => fila(p, true))}</div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {([["", "Todos"], ...TIPOS.map((t) => [t, TIPO_COBRO[t].t])] as [string, string][]).map(([k, t]) => (
          <button
            key={k || "todos"}
            onClick={() => { setTipo(k as typeof tipo); setTodos(false); }}
            className={cn("rounded-full px-3.5 py-1.5 text-sm font-semibold", tipo === k ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea hover:bg-arena/60")}
          >
            {t} <span className={cn("ml-1 text-xs", tipo === k ? "text-white/80" : "text-gris")}>{soles(cobrado(k || undefined))}</span>
          </button>
        ))}
      </div>
      {tipo && <p className="mb-2 text-xs text-gris">{TIPO_COBRO[tipo].d}. Monto junto a cada pestaña: total cobrado.</p>}

      {!datos ? (
        <p className="text-sm text-gris">Cargando…</p>
      ) : !lista.length ? (
        <p className="text-sm text-gris">Todavía no hay cobros{tipo ? ` de ${TIPO_COBRO[tipo].t.toLowerCase()}` : ""}.</p>
      ) : (
        lista.map((p) => fila(p, false))
      )}

      <Modal abierto={!!abrir} onCerrar={() => setAbrir(null)} titulo={abrir?.accion === "confirmar" ? "Activar cobro de Culqi" : "Rechazar cobro"}>
        {abrir && (
          <div className="space-y-4">
            <p className="text-sm text-gris">
              {abrir.p.tienda} · {TIPO_COBRO[abrir.p.tipo]?.t ?? abrir.p.tipo} · {abrir.p.concepto} · <b className="text-tinta">{soles(abrir.p.monto_centimos)}</b>
            </p>
            {abrir.accion === "confirmar" ? (
              <Campo etiqueta="Código del cobro de Culqi" ayuda="Verifica en el panel de Culqi que este cobro esté aprobado antes de activarlo.">
                <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={40} placeholder="chr_…" />
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
                {abrir.accion === "confirmar" ? "Activar compra" : "Rechazar"}
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </Tarjeta>
  );
}
