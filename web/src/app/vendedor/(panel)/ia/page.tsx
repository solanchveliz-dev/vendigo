"use client";

import Link from "next/link";
import { useState } from "react";
import { BarChart3, Camera, FileText, Info, MessageSquareQuote, Sparkles } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import type { Creditos, Plan } from "@/lib/tipos";
import { Aviso, Boton, Cargando, Encabezado, Modal, Tarjeta, useAvisar } from "@/components/ui";

const herramientas = [
  { id: "publicar_con_foto", icono: Camera, titulo: "Publicar con foto", texto: "Sube la foto y la IA propone nombre, descripción y categoría.", href: "/vendedor/productos/nuevo", boton: "Publicar un producto" },
  { id: "leer_boleta", icono: FileText, titulo: "Leer boleta de envío", texto: "Al registrar un envío, la IA lee el número de orden y la clave de la boleta.", href: "/vendedor/pedidos?grupo=por_enviar", boton: "Ver pedidos por enviar" },
  { id: "analista_ventas", icono: BarChart3, titulo: "Analista de ventas", texto: "Revisa qué se vendió más y qué menos, estima las próximas semanas y te dice qué reponer, qué impulsar y qué revisar.", href: "/vendedor/analitica", boton: "Analizar mis ventas" },
  { id: "resumen_opiniones", icono: MessageSquareQuote, titulo: "Resumen de opiniones", texto: "Resume lo que dicen tus clientes de cada producto. Gratis.", href: "", boton: "" },
];

export default function HerramientasIA() {
  const { datos: c, setDatos } = useApi<Creditos>("/vendedor/ia");
  const planes = useApi<{ planes: Plan[] }>("/planes");
  const avisar = useAvisar();
  const [confirmar, setConfirmar] = useState(false);
  const [comprando, setComprando] = useState(false);
  if (!c) return <Cargando />;
  const renueva = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString("es-PE", { day: "numeric", month: "long" });
  const total = c.del_plan + c.extra;

  async function comprar() {
    setComprando(true);
    try {
      setDatos(await api.post<Creditos>("/vendedor/ia/creditos-extra"));
      avisar("Listo: +100 créditos este mes.");
      setConfirmar(false);
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setComprando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Encabezado titulo="Herramientas IA" detalle="La IA no responde mensajes por ti: hace las tareas que te quitan tiempo. Siempre revisas lo que completa." />
      <Tarjeta className="flex flex-wrap items-center gap-5">
        <span className="grid size-12 place-items-center rounded-xl bg-coral-claro text-coral">
          <Sparkles className="size-6" />
        </span>
        <div className="min-w-56 flex-1">
          <p className="font-display text-2xl font-extrabold text-pino">{c.quedan} créditos</p>
          <p className="text-sm text-gris">
            Te quedan este mes de {total} ({c.usados} usados). Se renuevan el {renueva} con tu plan.
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-arena">
            <div className="h-full rounded-full bg-coral" style={{ width: `${total ? (c.quedan / total) * 100 : 0}%` }} />
          </div>
        </div>
        <Boton variante="secundario" onClick={() => setConfirmar(true)}>
          +100 créditos por S/ 5
        </Boton>
      </Tarjeta>
      {c.quedan < 3 && <Aviso tono="aviso">Te quedan pocos créditos. Las herramientas con fotos gastan más.</Aviso>}
      <div className="grid gap-4 sm:grid-cols-2">
        {herramientas.map((h) => (
          <Tarjeta key={h.id} className="flex flex-col">
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-pino-claro text-pino">
                <h.icono className="size-5" />
              </span>
              <span className="rounded-full bg-arena px-2.5 py-0.5 text-xs font-semibold">{c.costos[h.id] ? `${c.costos[h.id]} ${c.costos[h.id] === 1 ? "crédito" : "créditos"}` : "Gratis"}</span>
            </div>
            <p className="mt-3 font-semibold">{h.titulo}</p>
            <p className="flex-1 text-sm text-gris">{h.texto}</p>
            {h.href ? (
              <Link href={h.href} className="mt-4">
                <Boton variante="secundario" tamano="sm">{h.boton}</Boton>
              </Link>
            ) : (
              <p className="mt-4 text-xs text-gris">Aparece en cada producto cuando tenga opiniones.</p>
            )}
          </Tarjeta>
        ))}
      </div>

      <Tarjeta>
        <p className="font-semibold">¿Por qué créditos?</p>
        <p className="mt-1 text-sm text-gris">
          Cada vez que la IA trabaja, VendiGo paga por el procesamiento que usa. Leer una foto cuesta más que escribir un texto, por eso “Publicar con foto” gasta más
          créditos. Las fotos se achican antes de enviarlas para gastar menos. Si una herramienta falla, no se descuentan créditos.
        </p>
        {!!planes.datos?.planes.length && (
          <p className="mt-2 text-sm">
            {planes.datos.planes.map((p, i) => (
              <span key={p.id}>
                {i > 0 && " · "}
                <b>{p.nombre}:</b> {p.creditos_ia.toLocaleString("es-PE")}
              </span>
            ))}{" "}
            créditos al mes
          </p>
        )}
      </Tarjeta>
      <p className="flex items-start gap-1.5 text-xs text-gris">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        La IA no responde a tus clientes: tu tienda ya muestra precio, stock y envíos para que compren solos. Siempre revisas lo que la IA llena antes de guardarlo.
      </p>

      <Modal abierto={confirmar} onCerrar={() => setConfirmar(false)} titulo="¿Comprar 100 créditos?">
        <p className="text-sm text-gris">Se suman a los de este mes. El cobro de S/ 5.00 aparece en los pagos de tu plan. Los créditos extra no pasan al mes siguiente.</p>
        <div className="mt-4 flex gap-2">
          <Boton cargando={comprando} onClick={comprar}>Comprar por S/ 5</Boton>
          <Boton variante="secundario" onClick={() => setConfirmar(false)}>Cancelar</Boton>
        </div>
      </Modal>
    </div>
  );
}
