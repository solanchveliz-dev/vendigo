"use client";

import { useMemo, useState } from "react";
import { LocateFixed, MapPin, Pencil, Plus, Search } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Boton, Cargando, Entrada, Modal, useAvisar } from "@/components/ui";
import { Estado, Indicador, Paginacion, Titulo, useExportar } from "@/components/admin/ui";
import { esEnlaceCorto, leerUbicacion } from "@/lib/ubicacion";

type Sede = { id: string; agencia: string; ciudad: string; nombre: string; direccion: string; activa: boolean; lat: number | null; lng: number | null; ubicacion_auto: boolean; de_ejemplo: boolean };
const vacia: Sede = { id: "", agencia: "Shalom", ciudad: "", nombre: "", direccion: "", activa: true, lat: null, lng: null, ubicacion_auto: false, de_ejemplo: false };
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
  // Lo que había al abrir la sede: si no se cambia, se conserva si la ubicación fue automática.
  const [inicial, setInicial] = useState<{ enlace: string; direccion: string; ciudad: string } | null>(null);
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
    const e = s.lat != null && s.lng != null ? `${s.lat}, ${s.lng}` : "";
    setForm({ ...s });
    setEnlace(e);
    setInicial({ enlace: e, direccion: s.direccion, ciudad: s.ciudad });
  }

  // "Ubicar automáticamente": OpenStreetMap convierte las direcciones en puntos del mapa, una por segundo.
  async function ubicarTodas() {
    setOcupado("ubicar");
    try {
      const r = await api.post<{ ubicadas: number; sin_encontrar: string[]; faltan: number }>("/admin/agencias/ubicar");
      const partes = [`${r.ubicadas} ${r.ubicadas === 1 ? "sede ubicada" : "sedes ubicadas"}. Revisa cada una con “Ver en mapa”.`];
      if (r.sin_encontrar.length) partes.push(`No se encontró: ${r.sin_encontrar.join(", ")}. Para esas, pega el enlace de Google Maps.`);
      if (r.faltan > r.sin_encontrar.length) partes.push("Quedan más: vuelve a tocar el botón.");
      avisar(partes.join(" "));
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado("");
    }
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
    const sinCambios = !!inicial && enlace === inicial.enlace;
    const movida = !!inicial && (form.direccion !== inicial.direccion || form.ciudad !== inicial.ciudad);
    if (form.ubicacion_auto && sinCambios && movida) {
      // Cambió la dirección de una sede ubicada sola: se vuelve a ubicar desde la nueva dirección.
      form.lat = null;
      form.lng = null;
    } else {
      form.lat = punto?.lat ?? null;
      form.lng = punto?.lng ?? null;
      form.ubicacion_auto = form.ubicacion_auto && sinCambios;
    }
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
        accion={
          <span className="flex flex-wrap gap-2">
            {sinUbicacion > 0 && (
              <Boton variante="secundario" cargando={ocupado === "ubicar"} onClick={ubicarTodas}><LocateFixed className="size-4" /> Ubicar automáticamente</Boton>
            )}
            <Boton onClick={() => abrir({ ...vacia })}><Plus className="size-4" /> Agregar agencia</Boton>
          </span>
        }
      />
      {sinUbicacion > 0 && (
        <p className="rounded-2xl bg-aviso-claro px-4 py-3 text-sm font-semibold text-aviso">
          {sinUbicacion === 1 ? "1 sede activa no tiene" : `${sinUbicacion} sedes activas no tienen`} ubicación: no aparecerán en “la más cercana a mí”. Toca “Ubicar automáticamente” o pega su enlace de Google Maps.
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
                        <td className="px-5 py-3 font-bold text-tinta">
                          {s.nombre}
                          {s.de_ejemplo && <span title="Sede de demostración: confirma la dirección con la agencia antes de usarla con clientes reales." className="ml-2 align-middle"><Estado tono="neutro">Ejemplo</Estado></span>}
                        </td>
                        <td className="px-5 py-3 text-tinta">{s.direccion}</td>
                        <td className="px-5 py-3">
                          {s.lat != null ? (
                            <span className="flex flex-col items-start gap-1">
                              <a href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`} target="_blank" rel="noreferrer" className="font-semibold text-tinta underline underline-offset-2">Ver en mapa</a>
                              {s.ubicacion_auto && <span title="La ubicó OpenStreetMap desde la dirección. Puede caer en la calle y no en el número exacto." className="text-xs font-semibold text-aviso">Automática · revisar</span>}
                            </span>
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
                {errorEnlace || (punto ? `Ubicación: ${punto.lat.toFixed(5)}, ${punto.lng.toFixed(5)}${form.ubicacion_auto && enlace === inicial?.enlace ? " (automática, revísala en el mapa)" : ""}` : "Opcional. Si lo dejas vacío, al guardar se ubica sola desde la dirección con OpenStreetMap. Para más precisión, pega el enlace de Google Maps de la sede.")}
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm text-tinta">
              <input type="checkbox" checked={form.de_ejemplo} onChange={(e) => setForm({ ...form, de_ejemplo: e.target.checked })} className="mt-0.5 size-4 accent-pino" />
              <span>Sede de ejemplo (demostración). <span className="text-gris">Desmárcala cuando confirmes que la dirección es real.</span></span>
            </label>
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
