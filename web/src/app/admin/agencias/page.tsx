"use client";

import { useMemo, useState } from "react";
import { MapPin, Pencil, Plus, Search } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Boton, Cargando, Entrada, Modal, useAvisar } from "@/components/ui";
import { Estado, Indicador, Paginacion, Titulo, useExportar } from "@/components/admin/ui";
import { esEnlaceCorto, leerUbicacion } from "@/lib/ubicacion";

type Sede = { id: string; agencia: string; ciudad: string; nombre: string; direccion: string; activa: boolean; lat: number | null; lng: number | null };
const vacia: Sede = { id: "", agencia: "Shalom", ciudad: "", nombre: "", direccion: "", activa: true, lat: null, lng: null };
const POR_PAGINA = 25;

export default function Agencias() {
  const avisar = useAvisar();
  const { datos, recargar } = useApi<{ sedes: Sede[] }>("/admin/agencias");
  const [q, setQ] = useState("");
  const [agencia, setAgencia] = useState("");
  const [pagina, setPagina] = useState(1);
  const [form, setForm] = useState<Sede | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [enlace, setEnlace] = useState("");
  const sinUbicacion = (datos?.sedes ?? []).filter((s) => s.activa && s.lat == null).length;

  const sedes = datos?.sedes ?? [];
  const agencias = useMemo(() => [...new Set(sedes.map((s) => s.agencia))], [sedes]);
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return sedes.filter((s) => (!agencia || s.agencia === agencia) && (!t || [s.ciudad, s.nombre, s.direccion].some((v) => v.toLowerCase().includes(t))));
  }, [sedes, q, agencia]);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = lista.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  useExportar("agencias", () => [["Agencia", "Ciudad", "Nombre", "Dirección", "Estado"], ...lista.map((s) => [s.agencia, s.ciudad, s.nombre, s.direccion, s.activa ? "Activa" : "Inactiva"])]);

  function abrir(s: Sede) {
    setForm({ ...s });
    setEnlace(s.lat != null && s.lng != null ? `${s.lat}, ${s.lng}` : "");
  }

  // La ubicación sale del enlace de Google Maps (o de "lat, lng") que pega el admin.
  const punto = enlace.trim() ? leerUbicacion(enlace) : null;
  const errorEnlace = enlace.trim() && !punto
    ? esEnlaceCorto(enlace)
      ? "Ese es un enlace corto. Ábrelo, espera que cargue el mapa y copia el enlace largo de la barra del navegador."
      : "No encontramos coordenadas del Perú en ese texto. Pega el enlace de Google Maps de la sede o escribe “-12.09, -77.04”."
    : "";

  async function guardar() {
    if (!form) return;
    if (errorEnlace) return avisar(errorEnlace, "error");
    form.lat = punto?.lat ?? null;
    form.lng = punto?.lng ?? null;
    setOcupado("form");
    try {
      const r = form.id ? await api.put<{ mensaje: string }>(`/admin/agencias/${form.id}`, form) : await api.post<{ mensaje: string }>("/admin/agencias", form);
      avisar(r.mensaje);
      setForm(null);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado("");
    }
  }
  async function alternar(s: Sede) {
    setOcupado(s.id);
    try {
      const r = await api.post<{ mensaje: string }>(`/admin/agencias/${s.id}/estado`);
      avisar(r.mensaje);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado("");
    }
  }

  return (
    <>
      <Titulo
        titulo="Agencias de envío"
        detalle="Las sedes que verá el comprador al elegir dónde recoger. Mantén las direcciones al día."
        accion={<Boton onClick={() => abrir({ ...vacia })}><Plus className="size-4" /> Agregar agencia</Boton>}
      />
      {sinUbicacion > 0 && (
        <p className="rounded-2xl bg-aviso-claro px-4 py-3 text-sm font-semibold text-aviso">
          {sinUbicacion === 1 ? "1 sede activa no tiene" : `${sinUbicacion} sedes activas no tienen`} ubicación: no aparecerán en “la más cercana a mí”. Edítalas y pega su enlace de Google Maps.
        </p>
      )}
      {!datos ? (
        <Cargando />
      ) : (
        <>
          {agencias.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {agencias.slice(0, 3).map((a) => (
                <Indicador key={a} titulo={a} valor={sedes.filter((s) => s.agencia === a && s.activa).length} detalle="sedes activas" icono={<MapPin className="size-4" />} />
              ))}
            </div>
          )}
          <section className="overflow-hidden rounded-[22px] bg-white ring-1 ring-linea/70">
            <div className="flex flex-wrap items-center gap-3 border-b border-linea p-4">
              <label className="relative w-full sm:w-80">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-tinta" />
                <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="Buscar por ciudad, nombre o dirección…" className="h-11 w-full rounded-full border border-linea bg-white pl-11 pr-4 text-sm outline-none focus:border-pino" />
              </label>
              <select value={agencia} onChange={(e) => { setAgencia(e.target.value); setPagina(1); }} className="h-11 rounded-xl border border-linea bg-white px-4 text-sm outline-none" aria-label="Agencia">
                <option value="">Agencia: todas</option>
                {agencias.map((a) => <option key={a}>{a}</option>)}
              </select>
              <span className="ml-auto text-sm text-gris">{lista.length} registros</span>
            </div>
            {!lista.length ? (
              <p className="p-6 text-sm text-gris">{sedes.length ? "No hay sedes con ese filtro." : "Aún no hay sedes. Agrega la primera con “Agregar agencia”."}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b border-linea text-left text-[13px] font-semibold text-gris">
                      <th className="px-5 py-3.5">Agencia</th>
                      <th className="px-5 py-3.5">Ciudad</th>
                      <th className="px-5 py-3.5">Nombre</th>
                      <th className="px-5 py-3.5">Dirección</th>
                      <th className="px-5 py-3.5">Ubicación</th>
                      <th className="px-5 py-3.5">Estado</th>
                      <th className="px-5 py-3.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((s) => (
                      <tr key={s.id} className="border-b border-linea last:border-0 hover:bg-crema/40">
                        <td className="px-5 py-3 text-tinta">{s.agencia}</td>
                        <td className="px-5 py-3 text-tinta">{s.ciudad}</td>
                        <td className="px-5 py-3 font-bold text-tinta">{s.nombre}</td>
                        <td className="px-5 py-3 text-tinta">{s.direccion}</td>
                        <td className="px-5 py-3">
                          {s.lat != null ? (
                            <a href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="font-semibold text-tinta underline underline-offset-2">Ver en mapa</a>
                          ) : (
                            <Estado tono="aviso">Sin ubicación</Estado>
                          )}
                        </td>
                        <td className="px-5 py-3"><Estado tono={s.activa ? "ok" : "neutro"}>{s.activa ? "Activa" : "Inactiva"}</Estado></td>
                        <td className="px-5 py-3">
                          <span className="flex justify-end gap-2">
                            <Boton tamano="sm" variante="secundario" onClick={() => abrir(s)}><Pencil className="size-3.5" /> Editar</Boton>
                            <Boton tamano="sm" variante="secundario" cargando={ocupado === s.id} onClick={() => alternar(s)}>{s.activa ? "Desactivar" : "Activar"}</Boton>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Paginacion total={lista.length} visibles={visibles.length} pagina={actual} paginas={paginas} cambiar={setPagina} />
          </section>
        </>
      )}
      <Modal abierto={!!form} onCerrar={() => setForm(null)} titulo={form?.id ? "Editar agencia" : "Agregar agencia"}>
        {form && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Entrada value={form.agencia} onChange={(e) => setForm({ ...form, agencia: e.target.value })} placeholder="Agencia (ej. Shalom)" list="agencias-lista" />
              <Entrada value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} placeholder="Ciudad" />
            </div>
            <datalist id="agencias-lista">{["Shalom", "Olva Courier", "Marvisur", "Flores", ...agencias].filter((v, i, a) => a.indexOf(v) === i).map((a) => <option key={a} value={a} />)}</datalist>
            <Entrada value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre de la sede (ej. Shalom Surco)" />
            <Entrada value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Dirección" />
            <div>
              <Entrada value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="Ubicación: pega el enlace de Google Maps de la sede" />
              <p className={`mt-1.5 text-xs ${errorEnlace ? "text-error" : "text-gris"}`}>
                {errorEnlace || (punto ? `Ubicación leída: ${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)}` : "Busca la sede en Google Maps, ábrela y copia el enlace de la barra del navegador. Sin ubicación, no sale en “la más cercana”.")}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Boton variante="secundario" onClick={() => setForm(null)}>Cancelar</Boton>
              <Boton onClick={guardar} cargando={ocupado === "form"}>Guardar</Boton>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
