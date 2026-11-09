"use client";

import Link from "next/link";
import { useState } from "react";
import { Banknote } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { fechaHora } from "@/lib/admin";
import { Area, Boton, Campo, Cargando, Entrada, Insignia, Modal, Vacio, cn, useAvisar } from "@/components/ui";

type Retiro = {
  id: string;
  tienda: string;
  usuario_id: string;
  vendedora: string;
  monto_centimos: number;
  banco: string;
  ultimos4: string;
  titular: string;
  tipo_cuenta: string;
  estado: string;
  operacion: string;
  motivo_rechazo: string;
  creado_en: string;
  pagado_en: string | null;
  pedidos: number;
};

const ESTADOS: Record<string, { t: string; tono: "aviso" | "ok" | "error" }> = {
  en_proceso: { t: "Por transferir", tono: "aviso" },
  pagado: { t: "Transferido", tono: "ok" },
  rechazado: { t: "Rechazado", tono: "error" },
};

export default function Retiros() {
  const [estado, setEstado] = useState("en_proceso");
  const { datos, recargar } = useApi<{ retiros: Retiro[] }>(`/admin/retiros?estado=${estado}`);
  const [accion, setAccion] = useState<{ r: Retiro; tipo: "pagado" | "rechazar" } | null>(null);
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useAvisar();

  async function confirmar() {
    if (!accion) return;
    setEnviando(true);
    try {
      const cuerpo = accion.tipo === "pagado" ? { operacion: valor } : { motivo: valor };
      const r = await api.post<{ mensaje: string }>(`/admin/retiros/${accion.r.id}/${accion.tipo}`, cuerpo);
      avisar(r.mensaje);
      setAccion(null);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold text-pino">Retiros</h1>
        <p className="text-sm text-gris">Haz la transferencia desde la cuenta de VendiGo en tu banco y luego regístrala aquí con su número de operación.</p>
      </div>
      <div className="flex w-fit gap-1 rounded-full bg-white p-1 ring-1 ring-linea">
        {[["en_proceso", "Por transferir"], ["pagado", "Transferidos"], ["rechazado", "Rechazados"]].map(([k, t]) => (
          <button key={k} onClick={() => setEstado(k)} className={cn("h-9 rounded-full px-4 text-sm font-semibold", estado === k ? "bg-pino text-white" : "text-tinta")}>
            {t}
          </button>
        ))}
      </div>
      {!datos ? (
        <Cargando />
      ) : !datos.retiros.length ? (
        <Vacio icono={<Banknote className="size-6" />} titulo="Nada por aquí" detalle="No hay retiros en esta lista." />
      ) : (
        <div className="space-y-3">
          {datos.retiros.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
              <div className="min-w-0 flex-1">
                <b className="block text-lg text-tinta">{soles(r.monto_centimos)}</b>
                <span className="text-sm text-gris">
                  {r.banco} · {r.tipo_cuenta} •••• {r.ultimos4} · titular <b className="text-tinta">{r.titular}</b>
                </span>
                <span className="block text-xs text-gris">
                  <Link href={`/admin/vendedoras/${r.usuario_id}`} className="font-semibold hover:text-pino">{r.vendedora}</Link> ({r.tienda}) · {r.pedidos} pedidos · pedido el {fechaHora(r.creado_en)}
                  {r.operacion ? ` · Op. ${r.operacion}` : ""}
                  {r.motivo_rechazo ? ` · ${r.motivo_rechazo}` : ""}
                </span>
              </div>
              <Insignia tono={ESTADOS[r.estado].tono}>{ESTADOS[r.estado].t}</Insignia>
              {r.estado === "en_proceso" && (
                <div className="flex gap-2">
                  <Boton variante="peligro" tamano="sm" onClick={() => { setValor(""); setAccion({ r, tipo: "rechazar" }); }}>Rechazar</Boton>
                  <Boton tamano="sm" onClick={() => { setValor(""); setAccion({ r, tipo: "pagado" }); }}>Marcar transferido</Boton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal abierto={!!accion} onCerrar={() => setAccion(null)} titulo={accion?.tipo === "pagado" ? "Registrar transferencia" : "Rechazar retiro"}>
        {accion && (
          <div className="space-y-4">
            <p className="text-sm text-gris">
              {soles(accion.r.monto_centimos)} a {accion.r.banco} •••• {accion.r.ultimos4} ({accion.r.titular}).{" "}
              {accion.tipo === "pagado" ? "La vendedora recibirá un aviso con el número de operación." : "El monto vuelve a su saldo disponible y se le avisa el motivo."}
            </p>
            {accion.tipo === "pagado" ? (
              <Campo etiqueta="N.° de operación del banco">
                <Entrada value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej. 00012345" maxLength={30} />
              </Campo>
            ) : (
              <Area value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Motivo (ej. La cuenta no está a nombre de la vendedora)" maxLength={300} />
            )}
            <div className="flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setAccion(null)}>Cancelar</Boton>
              <Boton variante={accion.tipo === "pagado" ? "primario" : "peligro"} onClick={confirmar} cargando={enviando} disabled={valor.trim().length < (accion.tipo === "pagado" ? 4 : 5)}>
                {accion.tipo === "pagado" ? "Confirmar transferencia" : "Rechazar retiro"}
              </Boton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
