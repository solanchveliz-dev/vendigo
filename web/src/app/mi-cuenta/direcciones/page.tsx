"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Boton, Campo, Cargando, Entrada, Modal, useAvisar } from "@/components/ui";
import { Titulo } from "@/components/admin/ui";
import { Vacio, type Direccion } from "@/components/comprador/ui";

const VACIA: Direccion = { id: "", etiqueta: "Casa", direccion: "", distrito: "", ciudad: "Lima", referencia: "", principal: false };

// Direcciones (prototipo n.° 27): se usan para el delivery con motorizado y se llenan solas en la compra.
export default function Direcciones() {
  const { datos, recargar } = useApi<{ direcciones: Direccion[] }>("/comprador/direcciones");
  const avisar = useAvisar();
  const [editar, setEditar] = useState<Direccion | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!editar) return;
    setError("");
    setGuardando(true);
    try {
      if (editar.id) await api.put(`/comprador/direcciones/${editar.id}`, editar);
      else await api.post("/comprador/direcciones", editar);
      setEditar(null);
      avisar("Dirección guardada.");
      recargar();
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }
  async function accion(promesa: Promise<unknown>, texto: string) {
    try {
      await promesa;
      avisar(texto);
      recargar();
    } catch (err) {
      avisar((err as ErrorApi).message, "error");
    }
  }

  if (!datos) return <Cargando />;
  const cambiar = (k: keyof Direccion) => (e: React.ChangeEvent<HTMLInputElement>) => setEditar({ ...editar!, [k]: e.target.value });

  return (
    <div className="space-y-6">
      <Titulo
        titulo="Direcciones"
        detalle="Se usan para entregas con motorizado. La principal se llena sola al comprar."
        migas={<><Link href="/mi-cuenta/perfil" className="hover:text-tinta">Perfil</Link> / Direcciones</>}
        accion={<Boton onClick={() => { setError(""); setEditar(VACIA); }}><Plus className="size-4" /> Agregar dirección</Boton>}
      />
      {!datos.direcciones.length ? (
        <Vacio titulo="No tienes direcciones guardadas" texto="Agrega una para agilizar tus compras con envío.">
          <Boton onClick={() => { setError(""); setEditar(VACIA); }}><Plus className="size-4" /> Agregar dirección</Boton>
        </Vacio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {datos.direcciones.map((d) => (
            <div key={d.id} className="space-y-3 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-pino-claro text-pino"><MapPin className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <b className="text-tinta">{d.etiqueta}</b>
                    {d.principal && <span className="rounded-full bg-pino-claro px-2 py-0.5 text-[11px] font-bold text-pino">Predeterminada</span>}
                  </p>
                  <p className="text-sm text-tinta">{d.direccion}</p>
                  <p className="text-sm text-gris">{[d.distrito, d.ciudad].filter(Boolean).join(", ")}</p>
                  {d.referencia && <p className="text-xs text-gris">Ref.: {d.referencia}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!d.principal && (
                  <Boton variante="secundario" tamano="sm" onClick={() => accion(api.post(`/comprador/direcciones/${d.id}/principal`), "Dirección predeterminada actualizada.")}>Usar como predeterminada</Boton>
                )}
                <Boton variante="fantasma" tamano="sm" onClick={() => { setError(""); setEditar(d); }}><Pencil className="size-4" /> Editar</Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => accion(api.del(`/comprador/direcciones/${d.id}`), "Dirección eliminada.")}><Trash2 className="size-4" /> Eliminar</Boton>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal abierto={!!editar} onCerrar={() => setEditar(null)} titulo={editar?.id ? "Editar dirección" : "Agregar dirección"}>
        {editar && (
          <form onSubmit={guardar} className="space-y-4">
            <Campo etiqueta="Nombre" ayuda="Ej. Casa, Trabajo, Casa de mi mamá.">
              <Entrada value={editar.etiqueta} onChange={cambiar("etiqueta")} maxLength={30} required />
            </Campo>
            <Campo etiqueta="Dirección">
              <Entrada value={editar.direccion} onChange={cambiar("direccion")} placeholder="Av. Arequipa 1234, dpto. 502" maxLength={160} required />
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Distrito"><Entrada value={editar.distrito} onChange={cambiar("distrito")} maxLength={60} /></Campo>
              <Campo etiqueta="Ciudad"><Entrada value={editar.ciudad} onChange={cambiar("ciudad")} maxLength={60} /></Campo>
            </div>
            <Campo etiqueta="Referencia (opcional)">
              <Entrada value={editar.referencia} onChange={cambiar("referencia")} placeholder="Frente al parque, puerta verde" maxLength={160} />
            </Campo>
            {error && <p className="text-sm font-semibold text-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Boton type="button" variante="secundario" onClick={() => setEditar(null)}>Cancelar</Boton>
              <Boton type="submit" cargando={guardando}>Guardar</Boton>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
