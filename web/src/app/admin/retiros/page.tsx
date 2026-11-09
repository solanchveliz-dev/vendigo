"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock, Search, ShieldCheck } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { Area, Boton, Campo, Cargando, Entrada, Modal, useAvisar } from "@/components/ui";
import { Estado, Indicador, Nota, Paginacion, Titulo, useExportar } from "@/components/admin/ui";

type Retiro = {
  id: string;
  numero: number;
  tienda: string;
  usuario_id: string;
  vendedora: string;
  monto_centimos: number;
  banco: string;
  ultimos4: string;
  titular: string;
  tipo_cuenta: string;
  estado: "en_proceso" | "pagado" | "rechazado";
  operacion: string;
  motivo_rechazo: string;
  creado_en: string;
  pagado_en: string | null;
  pedidos: number;
};
type Datos = {
  retiros: Retiro[];
  indicadores: { en_proceso_centimos: number; en_proceso: number; pagado_semana_centimos: number; pagado_semana: number; retenido_centimos: number; retenido_tiendas: number };
};

const ESTADOS = { en_proceso: { t: "En proceso", tono: "aviso" as const }, pagado: { t: "Pagado", tono: "neutro" as const }, rechazado: { t: "Rechazado", tono: "error" as const } };
const POR_PAGINA = 20;
const numero = (n: number) => `R-${String(n).padStart(4, "0")}`;
function cuando(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" })} · ${d.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit" })}`;
}

export default function Retiros() {
  const { datos, recargar } = useApi<Datos>("/admin/retiros?estado=todos");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [pagina, setPagina] = useState(1);
  const [accion, setAccion] = useState<Retiro | null>(null);
  const [rechazar, setRechazar] = useState(false);
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const avisar = useAvisar();

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (datos?.retiros ?? []).filter((r) => (!estado || r.estado === estado) && (!t || [r.tienda, r.vendedora, numero(r.numero), r.operacion].some((x) => x.toLowerCase().includes(t))));
  }, [datos, q, estado]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("retiros", () => [
    ["N.°", "Tienda", "Vendedor", "Banco", "Cuenta", "Titular", "Fecha", "Monto (S/)", "Estado", "Operación"],
    ...lista.map((r) => [numero(r.numero), r.tienda, r.vendedora, r.banco, `•••• ${r.ultimos4}`, r.titular, r.creado_en.slice(0, 16).replace("T", " "), (r.monto_centimos / 100).toFixed(2), ESTADOS[r.estado].t, r.operacion]),
  ]);

  async function confirmar() {
    if (!accion) return;
    setEnviando(true);
    try {
      const r = rechazar
        ? await api.post<{ mensaje: string }>(`/admin/retiros/${accion.id}/rechazar`, { motivo: valor })
        : await api.post<{ mensaje: string }>(`/admin/retiros/${accion.id}/pagado`, { operacion: valor });
      avisar(r.mensaje);
      setAccion(null);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  if (!datos) return <Cargando />;
  const k = datos.indicadores;

  return (
    <>
      <Titulo titulo="Retiros de vendedores" detalle="El dinero liberado que cada tienda pidió pasar a su cuenta. Se transfiere con el CCI registrado." />
      <div className="grid gap-5 md:grid-cols-3">
        <Indicador oscuro titulo="En proceso" valor={soles(k.en_proceso_centimos)} detalle={`${k.en_proceso} ${k.en_proceso === 1 ? "retiro" : "retiros"} por transferir`} icono={<Clock className="size-[18px]" />} />
        <Indicador titulo="Pagado esta semana" valor={soles(k.pagado_semana_centimos)} detalle={`${k.pagado_semana} ${k.pagado_semana === 1 ? "transferencia" : "transferencias"}`} icono={<CheckCircle2 className="size-[18px]" />} />
        <Indicador titulo="Retenidos" valor={soles(k.retenido_centimos)} detalle={`Por verificación de identidad · ${k.retenido_tiendas} ${k.retenido_tiendas === 1 ? "tienda" : "tiendas"}`} icono={<ShieldCheck className="size-[18px]" />} />
      </div>

      <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
        <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
          <label className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar por tienda o número…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
          </label>
          <select value={estado} onChange={(e) => { setEstado(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Estado">
            <option value="">Estado: todos</option>
            <option value="en_proceso">En proceso</option>
            <option value="pagado">Pagado</option>
            <option value="rechazado">Rechazado</option>
          </select>
          <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
        </div>
        {!lista.length ? (
          <p className="p-6 text-sm text-gris">No hay retiros con ese filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                  <th className="px-5 py-3.5">N.º</th>
                  <th className="px-5 py-3.5">Tienda</th>
                  <th className="px-5 py-3.5">Cuenta</th>
                  <th className="px-5 py-3.5">Fecha</th>
                  <th className="px-5 py-3.5 text-right">Monto</th>
                  <th className="px-5 py-3.5">Estado</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <tr key={r.id} className="border-b border-linea last:border-0">
                    <td className="px-5 py-4 font-bold text-tinta">{numero(r.numero)}</td>
                    <td className="px-5 py-4">
                      <Link href={`/admin/vendedores/${r.usuario_id}`} className="text-tinta hover:text-pino">{r.tienda}</Link>
                      <span className="block text-xs text-gris">{r.vendedora}</span>
                    </td>
                    <td className="px-5 py-4 text-tinta">{r.banco} •••• {r.ultimos4}</td>
                    <td className="px-5 py-4 text-tinta">{cuando(r.creado_en)}</td>
                    <td className="px-5 py-4 text-right font-bold text-tinta">{soles(r.monto_centimos)}</td>
                    <td className="px-5 py-4">
                      <Estado tono={ESTADOS[r.estado].tono}>{ESTADOS[r.estado].t}</Estado>
                      {r.estado === "rechazado" && <span className="mt-1 block max-w-[220px] text-xs text-gris">{r.motivo_rechazo}</span>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {r.estado === "en_proceso" ? (
                        <Boton tamano="sm" onClick={() => { setValor(""); setRechazar(false); setAccion(r); }}>Marcar como pagado</Boton>
                      ) : r.operacion ? (
                        <span className="text-gris">Operación {r.operacion}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Paginacion total={lista.length} visibles={visibles.length} pagina={actual} paginas={paginas} cambiar={setPagina} />
      </section>
      <Nota>Solo se transfiere a cuentas a nombre del vendedor, con su identidad verificada. Los retiros de tiendas con reclamos abiertos esperan la decisión del reclamo.</Nota>

      <Modal abierto={!!accion} onCerrar={() => setAccion(null)} titulo={rechazar ? "No se pudo transferir" : "Marcar como pagado"}>
        {accion && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-crema p-4 text-sm text-tinta">
              <b className="text-lg">{soles(accion.monto_centimos)}</b> a {accion.banco} {accion.tipo_cuenta} •••• {accion.ultimos4}
              <span className="block text-gris">Titular: {accion.titular} · {accion.pedidos} pedidos · {numero(accion.numero)}</span>
            </div>
            {rechazar ? (
              <>
                <p className="text-sm text-gris">El monto vuelve a su saldo disponible y se le avisa el motivo.</p>
                <Area value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Motivo (ej. La cuenta no está a nombre del vendedor)" maxLength={300} />
              </>
            ) : (
              <Campo etiqueta="N.º de operación del banco" ayuda="Haz la transferencia desde la cuenta de VendiGo y copia aquí el número que te da tu banco.">
                <Entrada value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej. 00012345" maxLength={30} />
              </Campo>
            )}
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => { setRechazar(!rechazar); setValor(""); }} className="text-sm font-semibold text-gris hover:text-tinta">
                {rechazar ? "Volver" : "No se pudo transferir"}
              </button>
              <div className="flex gap-2">
                <Boton variante="secundario" onClick={() => setAccion(null)}>Cancelar</Boton>
                <Boton variante={rechazar ? "peligro" : "primario"} onClick={confirmar} cargando={enviando} disabled={valor.trim().length < (rechazar ? 5 : 4)}>
                  {rechazar ? "Rechazar retiro" : "Confirmar pago"}
                </Boton>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
