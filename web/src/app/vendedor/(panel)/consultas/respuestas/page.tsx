"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, ChevronRight, Pencil, Plus, Reply, Trash2 } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Area, Boton, Cargando, Entrada, Modal, useAvisar } from "@/components/ui";

type Rapida = { id: string; titulo: string; texto: string; auto: boolean };
type Lista = { respuestas: Rapida[] };

// "Respuestas rápidas": mensajes guardados para responder preguntas con un toque (sin IA).
export default function RespuestasRapidas() {
  const { datos, setDatos } = useApi<Lista>("/vendedor/respuestas-rapidas");
  const avisar = useAvisar();
  const [editando, setEditando] = useState<Partial<Rapida> | null>(null);
  const [borrar, setBorrar] = useState<Rapida | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function guardar() {
    if (!editando) return;
    setError("");
    setGuardando(true);
    try {
      const cuerpo = { titulo: editando.titulo ?? "", texto: editando.texto ?? "" };
      setDatos(editando.id ? await api.put<Lista>(`/vendedor/respuestas-rapidas/${editando.id}`, cuerpo) : await api.post<Lista>("/vendedor/respuestas-rapidas", cuerpo));
      setEditando(null);
      avisar("Respuesta guardada");
    } catch (e) {
      setError((e as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!borrar) return;
    try {
      setDatos(await api.del<Lista>(`/vendedor/respuestas-rapidas/${borrar.id}`));
      avisar("Respuesta eliminada");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
    setBorrar(null);
  }

  if (!datos) return <Cargando />;

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/consultas" className="hover:text-pino">Consultas</Link> <ChevronRight className="size-3.5" /> Respuestas rápidas
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
          <h1 className="text-[34px] font-extrabold leading-tight text-pino">Respuestas rápidas</h1>
          <p className="text-sm text-gris">Textos listos para responder las preguntas de tus productos con un toque. Las creamos con la información de tu tienda; puedes editarlas.</p>
        </div>
        <Boton onClick={() => { setError(""); setEditando({ titulo: "", texto: "" }); }}>
          <Plus className="size-4" /> Nueva respuesta
        </Boton>
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl bg-pino-claro px-4 py-3 text-sm text-tinta">
        <Check className="size-4 shrink-0" />
        <span>Las respuestas rápidas <b>no usan IA</b> ni gastan créditos: son mensajes guardados.</span>
      </div>

      {!datos.respuestas.length ? (
        <p className="rounded-[22px] bg-white p-6 text-sm text-gris ring-1 ring-linea/60">No tienes respuestas guardadas. Crea la primera con “Nueva respuesta”.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {datos.respuestas.map((r) => (
            <div key={r.id} className="rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta"><Reply className="size-[18px]" /></span>
                <b className="text-tinta">{r.titulo}</b>
                {r.auto && <span className="text-xs font-bold text-tinta">Creada automáticamente</span>}
                <span className="ml-auto flex gap-2">
                  <button aria-label="Editar" onClick={() => { setError(""); setEditando(r); }} className="grid size-9 place-items-center rounded-full ring-1 ring-linea hover:bg-crema"><Pencil className="size-4" /></button>
                  <button aria-label="Eliminar" onClick={() => setBorrar(r)} className="grid size-9 place-items-center rounded-full ring-1 ring-linea hover:bg-crema"><Trash2 className="size-4" /></button>
                </span>
              </div>
              <div className="mt-4 flex justify-end">
                <p className="max-w-full rounded-2xl rounded-br-md bg-pino px-4 py-2.5 text-sm text-white">{r.texto}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal abierto={!!editando} onCerrar={() => setEditando(null)} titulo={editando?.id ? "Editar respuesta" : "Nueva respuesta rápida"}>
        {editando && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold" htmlFor="qr-t">Nombre corto</label>
              <Entrada id="qr-t" maxLength={40} value={editando.titulo ?? ""} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} placeholder="Ej. Envíos" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold" htmlFor="qr-x">Mensaje</label>
              <Area id="qr-x" rows={4} maxLength={500} value={editando.texto ?? ""} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} />
            </div>
            {error && <p className="text-sm text-error">{error}</p>}
            <Boton bloque cargando={guardando} onClick={guardar}>Guardar</Boton>
          </div>
        )}
      </Modal>

      <Modal abierto={!!borrar} onCerrar={() => setBorrar(null)} titulo="¿Eliminar esta respuesta?">
        <p className="text-sm text-gris">“{borrar?.titulo}” dejará de aparecer al responder preguntas.</p>
        <div className="mt-4 flex gap-2">
          <Boton variante="peligro" onClick={eliminar}>Eliminar</Boton>
          <Boton variante="secundario" onClick={() => setBorrar(null)}>Cancelar</Boton>
        </div>
      </Modal>
    </div>
  );
}
