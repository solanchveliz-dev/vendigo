"use client";

import Link from "next/link";
import { ChevronRight, Crown, Eye, Landmark, MessageCircleQuestion, Pencil, QrCode, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { useApi } from "@/lib/api";
import { rubros } from "@/lib/catalogos";
import type { Tienda } from "@/lib/tipos";
import { Cargando, Tarjeta } from "@/components/ui";

function Opcion({ href, icono, titulo, detalle, externo }: { href: string; icono: React.ReactNode; titulo: string; detalle: string; externo?: boolean }) {
  return (
    <Link href={href} target={externo ? "_blank" : undefined} className="flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-crema">
      <span className="grid size-10 place-items-center rounded-xl bg-pino-claro text-pino">{icono}</span>
      <span className="flex-1">
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-sm text-gris">{detalle}</span>
      </span>
      <ChevronRight className="size-4 text-gris" />
    </Link>
  );
}

export default function MiTienda() {
  const { datos: t } = useApi<Tienda>("/vendedor/tienda");
  if (!t) return <Cargando />;
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl bg-white shadow-suave ring-1 ring-linea/60">
        <div className="h-36 bg-pino bg-cover bg-center" style={t.portada_url ? { backgroundImage: `url(${t.portada_url})` } : undefined} />
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <div className="-mt-10 size-20 overflow-hidden rounded-2xl bg-crema ring-4 ring-white">
            {t.logo_url ? <img src={t.logo_url} alt="" className="size-full object-cover" /> : <span className="grid size-full place-items-center font-display text-3xl font-extrabold text-pino">{t.nombre[0]}</span>}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-pino">{t.nombre}</h1>
            <p className="text-sm text-gris">
              {rubros[t.rubro]} · {t.distrito ? `${t.distrito}, ` : ""}
              {t.ciudad}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-lg font-extrabold text-pino">Tu tienda</h2>
          <Tarjeta className="p-2">
            <Opcion href="/vendedor/tienda/perfil" icono={<Pencil className="size-5" />} titulo="Editar perfil" detalle="Nombre, logo, portada y redes" />
            <Opcion href="/vendedor/tienda/entrega" icono={<Truck className="size-5" />} titulo="Formas de entrega" detalle="Recojo, agencia y motorizado" />
            <Opcion href="/vendedor/tienda/compartir" icono={<QrCode className="size-5" />} titulo="Compartir tienda" detalle="Tu enlace, tu QR y posts para redes" />
            <Opcion href={`/t/${t.slug}`} externo icono={<Eye className="size-5" />} titulo="Ver mi tienda como cliente" detalle={t.enlace.replace(/^https?:\/\//, "")} />
          </Tarjeta>
        </section>
        <section>
          <h2 className="mb-2 text-lg font-extrabold text-pino">Cuenta y herramientas</h2>
          <Tarjeta className="p-2">
            <Opcion href="/vendedor/consultas" icono={<MessageCircleQuestion className="size-5" />} titulo="Consultas" detalle="Preguntas de clientes en tus productos" />
            <Opcion href="/vendedor/ia" icono={<Sparkles className="size-5" />} titulo="Herramientas IA" detalle="Publicar con foto, leer boletas, posts" />
            <Opcion href="/vendedor/plan" icono={<Crown className="size-5" />} titulo="Plan y ventas" detalle="Tu cupo de ventas del mes" />
            <Opcion href="/vendedor/cuenta-bancaria" icono={<Landmark className="size-5" />} titulo="Cuenta para tus cobros" detalle="Dónde recibes tu dinero" />
            <Opcion href="/vendedor/verificacion" icono={<ShieldCheck className="size-5" />} titulo="Verificar identidad" detalle="Necesaria para retirar" />
          </Tarjeta>
        </section>
      </div>
    </div>
  );
}
