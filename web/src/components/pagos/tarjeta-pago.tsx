"use client";

import { useState } from "react";
import { Check, ExternalLink, Info, RotateCcw, X } from "lucide-react";
import { fecha, soles } from "@/lib/formato";
import type { PedidoDetalle } from "@/lib/tipos";
import { subirImagen } from "@/lib/subir";
import { Area, Boton, Entrada, Modal, Tarjeta } from "@/components/ui";
import { DEVOLUCION, EtiquetaPago, METODOS, ORIGEN } from "@/components/pagos/estado";

type Acciones = {
  // Si se pasan, la tarjeta muestra los botones de la tienda.
  informarPago?: (recibido: boolean, referencia: string) => Promise<boolean>;
  informarDevolucion?: (evidenciaKey: string, nota: string) => Promise<boolean>;
};

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-gris">{k}</span>
      <span className="text-right font-semibold text-tinta">{v}</span>
    </div>
  );
}

// Pago del pedido: el comprador le paga DIRECTO a la tienda. VendiGo solo registra lo que informan.
export function TarjetaPago({ pedido: p, ...a }: { pedido: PedidoDetalle } & Acciones) {
  const [modal, setModal] = useState<"" | "pago" | "devolucion">("");
  const pago = p.pago;
  if (!pago) return null;
  const puedeConfirmar = a.informarPago && p.acciones.includes("confirmar_pago");
  const devPendiente = p.devoluciones.find((d) => d.estado === "pendiente_tienda");

  return (
    <>
      <Tarjeta>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-tinta">Pago</h2>
          <EtiquetaPago estado={pago.estado} texto={pago.texto} />
        </div>
        <Fila k="Monto" v={soles(pago.monto_centimos)} />
        <Fila k="Cómo paga" v={METODOS[pago.metodo] ?? pago.metodo_texto} />
        <Fila k="Cuándo" v={pago.momento === "antes" ? "Antes del envío" : "Al recibir"} />
        <Fila k="Registro" v={ORIGEN[pago.origen]} />
        {pago.referencia && <Fila k="N.° de operación" v={pago.referencia} />}
        {pago.comprobante_url && (
          <a href={pago.comprobante_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-pino underline">
            Ver comprobante del cliente <ExternalLink className="size-3.5" />
          </a>
        )}
        {puedeConfirmar && (
          <Boton bloque className="mt-3" onClick={() => setModal("pago")}>
            Revisar el pago
          </Boton>
        )}
        <p className="mt-3 flex gap-1.5 text-xs text-gris">
          <Info className="mt-0.5 size-3.5 shrink-0" /> El cliente te paga directo a ti. VendiGo no recibe ni guarda tu dinero.
        </p>
        {pago.eventos.length > 1 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold text-tinta">Historial del pago</summary>
            <ul className="mt-2 space-y-1.5">
              {pago.eventos.map((e, i) => (
                <li key={i} className="text-xs text-gris">
                  <b className="text-tinta">{e.texto}</b> · {fecha(e.fecha, true)}
                  {e.detalle && <span className="block">{e.detalle}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Tarjeta>

      {p.devoluciones.length > 0 && (
        <Tarjeta className={devPendiente ? "ring-aviso/40" : undefined}>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-extrabold text-tinta">
            <RotateCcw className="size-4" /> Devolución
          </h2>
          {p.devoluciones.map((d, i) => (
            <div key={i} className="border-b border-linea py-2 last:border-0">
              <Fila k="Monto" v={soles(d.monto_centimos)} />
              <Fila k="Estado" v={DEVOLUCION[d.estado]} />
              {d.nota && <Fila k="Nota" v={d.nota} />}
              {d.evidencia_url && (
                <a href={d.evidencia_url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-pino underline">Ver captura de la devolución</a>
              )}
            </div>
          ))}
          {devPendiente && a.informarDevolucion && (
            <>
              <p className="mt-2 text-sm text-tinta/80">Devuélvele el dinero al cliente por el mismo medio (Yape, Plin o efectivo) e infórmalo con tu captura.</p>
              <Boton bloque variante="acento" className="mt-3" onClick={() => setModal("devolucion")}>
                Informar devolución
              </Boton>
            </>
          )}
        </Tarjeta>
      )}

      {a.informarPago && (
        <ModalPago abierto={modal === "pago"} cerrar={() => setModal("")} pedido={p} enviar={a.informarPago} />
      )}
      {a.informarDevolucion && devPendiente && (
        <ModalDevolucion abierto={modal === "devolucion"} cerrar={() => setModal("")} monto={devPendiente.monto_centimos} enviar={a.informarDevolucion} />
      )}
    </>
  );
}

function ModalPago({ abierto, cerrar, pedido: p, enviar }: { abierto: boolean; cerrar: () => void; pedido: PedidoDetalle; enviar: (r: boolean, ref: string) => Promise<boolean> }) {
  const [ref, setRef] = useState(p.pago?.referencia ?? "");
  const [enviando, setEnviando] = useState<"" | "si" | "no">("");
  async function ir(recibido: boolean) {
    setEnviando(recibido ? "si" : "no");
    if (await enviar(recibido, ref)) cerrar();
    setEnviando("");
  }
  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo={`¿Te llegó el pago de ${soles(p.pago?.monto_centimos ?? 0)}?`}>
      <div className="space-y-4">
        <p className="text-sm text-gris">
          Revisa tu {METODOS[p.pago?.metodo ?? ""] ?? "app"} y busca el pago de <b>{p.comprador}</b>. Solo confirma si ya lo ves en tu cuenta.
        </p>
        {p.pago?.comprobante_url && (
          <a href={p.pago.comprobante_url} target="_blank" rel="noreferrer">
            <img src={p.pago.comprobante_url} alt="Comprobante" className="max-h-64 w-full rounded-xl bg-arena object-contain" />
          </a>
        )}
        <Entrada value={ref} onChange={(e) => setRef(e.target.value.slice(0, 40))} placeholder="N.° de operación (opcional)" />
        <div className="grid grid-cols-2 gap-2">
          <Boton variante="secundario" cargando={enviando === "no"} onClick={() => ir(false)}><X className="size-4" /> No me llegó</Boton>
          <Boton cargando={enviando === "si"} onClick={() => ir(true)}><Check className="size-4" /> Sí, me llegó</Boton>
        </div>
      </div>
    </Modal>
  );
}

function ModalDevolucion({ abierto, cerrar, monto, enviar }: { abierto: boolean; cerrar: () => void; monto: number; enviar: (k: string, n: string) => Promise<boolean> }) {
  const [key, setKey] = useState("");
  const [vista, setVista] = useState("");
  const [nota, setNota] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  async function subir(f?: File) {
    if (!f) return;
    setSubiendo(true);
    try {
      const r = await subirImagen(f, "devolucion");
      setKey(r.key);
      setVista(URL.createObjectURL(f));
    } finally {
      setSubiendo(false);
    }
  }
  return (
    <Modal abierto={abierto} onCerrar={cerrar} titulo={`Informar devolución de ${soles(monto)}`}>
      <div className="space-y-4">
        <label className="grid min-h-32 cursor-pointer place-items-center overflow-hidden rounded-xl bg-arena text-sm font-semibold text-tinta ring-1 ring-linea">
          {vista ? <img src={vista} alt="" className="max-h-56 object-contain" /> : subiendo ? "Subiendo…" : "Toca para subir la captura de la devolución"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => subir(e.target.files?.[0])} />
        </label>
        <Area value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} rows={2} placeholder="Nota para el cliente (opcional)" />
        <Boton bloque disabled={!key} cargando={enviando} onClick={async () => { setEnviando(true); if (await enviar(key, nota)) cerrar(); setEnviando(false); }}>
          Informar devolución
        </Boton>
      </div>
    </Modal>
  );
}
