"use client";

import Link from "next/link";
import { Camera, FileText, Megaphone, MessageSquareQuote, Sparkles } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import type { Creditos } from "@/lib/tipos";
import { Aviso, Boton, Cargando, Encabezado, Tarjeta, useAvisar } from "@/components/ui";

const herramientas = [
  { id: "publicar_con_foto", icono: Camera, titulo: "Publicar con foto", texto: "Sube la foto y la IA propone nombre, descripción y categoría.", href: "/vendedor/productos/nuevo", boton: "Publicar un producto" },
  { id: "leer_boleta", icono: FileText, titulo: "Leer boleta de envío", texto: "Al registrar un envío, la IA lee el número de orden y la clave de la boleta.", href: "/vendedor/pedidos?grupo=por_enviar", boton: "Ver pedidos por enviar" },
  { id: "crear_post", icono: Megaphone, titulo: "Post para redes", texto: "Escribe el texto para Instagram, TikTok o Facebook de un producto.", href: "/vendedor/tienda/compartir", boton: "Crear un post" },
  { id: "resumen_opiniones", icono: MessageSquareQuote, titulo: "Resumen de opiniones", texto: "Resume lo que dicen tus clientes de cada producto. Gratis.", href: "", boton: "" },
];

export default function HerramientasIA() {
  const { datos: c, setDatos } = useApi<Creditos>("/vendedor/ia");
  const avisar = useAvisar();
  if (!c) return <Cargando />;
  const total = c.del_plan + c.extra;

  async function comprar() {
    try {
      setDatos(await api.post<Creditos>("/vendedor/ia/creditos-extra"));
      avisar("Listo: +100 créditos este mes.");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
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
            Te quedan este mes de {total} ({c.usados} usados). Se renuevan cada mes con tu plan.
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-arena">
            <div className="h-full rounded-full bg-coral" style={{ width: `${total ? (c.quedan / total) * 100 : 0}%` }} />
          </div>
        </div>
        <Boton variante="secundario" onClick={comprar}>
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
              <span className="rounded-full bg-arena px-2.5 py-0.5 text-xs font-semibold">{c.costos[h.id] ? `${c.costos[h.id]} créditos` : "Gratis"}</span>
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
    </div>
  );
}
