"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { ESTADO_INCIDENCIA, PRIORIDAD, TIPO_INCIDENCIA, codigoInc, fecha, fechaHora, type Incidencia, type TiendaAdmin } from "@/lib/admin";
import { Area, Boton, Cargando, useAvisar } from "@/components/ui";
import { Avatar, Estado, Tarjeta, Titulo } from "@/components/admin/ui";
import { AccionTienda } from "@/components/admin/acciones-tienda";

type Detalle = { incidencia: Incidencia; notas: { autor: string; texto: string; creado_en: string }[] };

export default function DetalleIncidencia({ params }: { params: Promise<{ n: string }> }) {
  const { n } = use(params);
  const avisar = useAvisar();
  const { datos: d, error, recargar } = useApi<Detalle>(`/admin/incidencias/${n}`);
  const i = d?.incidencia;
  const tienda = useApi<{ tienda: TiendaAdmin }>(i?.tienda_id ? `/admin/tiendas/${i.tienda_id}` : null);
  const [estado, setEstado] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState("");
  useEffect(() => { if (i) setEstado(i.estado); }, [i]);

  if (error && !d) return <p className="text-sm text-gris">No encontramos esta incidencia.</p>;
  if (!d || !i) return <Cargando />;

  async function enviar(que: "estado" | "nota") {
    setOcupado(que);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/incidencias/${n}/${que}`, que === "estado" ? { estado } : { texto: nota });
      avisar(r.mensaje);
      if (que === "nota") setNota("");
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado("");
    }
  }

  const seguimiento = [{ autor: i.reportado_por, texto: i.descripcion, creado_en: i.creado_en }, ...d.notas];

  return (
    <>
      <Titulo
        migas={<><Link href="/admin/incidencias" className="hover:text-pino">Incidencias</Link> <ChevronRight className="size-3.5" /> {codigoInc(i.numero)}</>}
        titulo={`${codigoInc(i.numero)} · ${i.titulo}`}
        detalle={`Reportado por ${i.reportado_por} el ${fecha(i.creado_en)}`}
        accion={
          <div className="flex gap-2">
            <Estado tono={PRIORIDAD[i.prioridad].tono}>{PRIORIDAD[i.prioridad].t}</Estado>
            <Estado tono={ESTADO_INCIDENCIA[i.estado].tono}>{ESTADO_INCIDENCIA[i.estado].t}</Estado>
          </div>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          <Tarjeta titulo="Descripción">
            <p className="text-[15px] text-tinta">{i.descripcion}</p>
            <dl className="mt-4 space-y-2.5 text-[15px]">
              {[
                ["Tipo", TIPO_INCIDENCIA[i.tipo]],
                ["Tienda", i.tienda_id ? <Link key="t" href={`/admin/tiendas/${i.tienda_id}`} className="font-bold hover:text-pino">{i.tienda}</Link> : "—"],
                ["Pedido", i.pedido ? <Link key="p" href={`/admin/pedidos/${i.pedido}`} className="font-bold hover:text-pino">{i.pedido}</Link> : "—"],
                ...(i.resuelta_en ? [["Resuelta", fechaHora(i.resuelta_en)]] : []),
              ].map(([k, v]) => (
                <div key={String(k)} className="grid grid-cols-[150px_1fr] gap-3">
                  <dt className="text-gris">{k}</dt>
                  <dd className="text-tinta">{v}</dd>
                </div>
              ))}
            </dl>
          </Tarjeta>
          <Tarjeta titulo="Seguimiento">
            <ul className="divide-y divide-linea">
              {seguimiento.map((s, k) => (
                <li key={k} className="flex gap-3 py-3 first:pt-0">
                  <Avatar nombre={s.autor.startsWith("Equipo") ? "V G" : s.autor} className={s.autor.startsWith("Equipo") ? "!bg-coral-claro !text-pino" : "!bg-crema !text-tinta"} />
                  <div className="min-w-0 flex-1">
                    <b className="block text-sm text-tinta">{s.autor}</b>
                    <p className="text-sm text-tinta">{s.texto}</p>
                  </div>
                  <span className="shrink-0 text-xs text-gris">{fechaHora(s.creado_en)}</span>
                </li>
              ))}
            </ul>
            <p className="mb-2 mt-4 text-sm font-semibold text-tinta">Nota interna</p>
            <Area value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escribe una nota o lo que hiciste (solo la ve el equipo)…" maxLength={2000} />
            <Boton className="mt-3" onClick={() => enviar("nota")} cargando={ocupado === "nota"} disabled={nota.trim().length < 3}>Agregar nota</Boton>
          </Tarjeta>
        </div>
        <Tarjeta titulo="Cambiar estado">
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="h-12 w-full rounded-xl border border-linea bg-white px-3 text-[15px] outline-none focus:border-pino" aria-label="Estado">
            {Object.entries(ESTADO_INCIDENCIA).map(([k, e]) => <option key={k} value={k}>{e.t}</option>)}
          </select>
          <Boton bloque className="mt-3" onClick={() => enviar("estado")} cargando={ocupado === "estado"} disabled={estado === i.estado}>Guardar</Boton>
          {tienda.datos && (
            <div className="mt-3 [&>*]:w-full [&_button]:w-full">
              <AccionTienda t={tienda.datos.tienda} alTerminar={tienda.recargar} grande />
            </div>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
