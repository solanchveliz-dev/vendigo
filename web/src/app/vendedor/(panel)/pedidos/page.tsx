"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Search } from "lucide-react";
import { useApi } from "@/lib/api";
import type { PedidoResumen } from "@/lib/tipos";
import { Cargando, Chips, Encabezado, Entrada, Selector, Tarjeta, Vacio } from "@/components/ui";
import { TablaPedidos } from "@/components/pedidos/tabla";

type Grupo = "todos" | "por_aceptar" | "por_enviar" | "recogen" | "en_camino" | "terminados";
const grupos: { valor: Grupo; texto: string }[] = [
  { valor: "todos", texto: "Todos" },
  { valor: "por_aceptar", texto: "Por aceptar" },
  { valor: "por_enviar", texto: "Por enviar" },
  { valor: "recogen", texto: "Recogen en tienda" },
  { valor: "en_camino", texto: "En camino" },
  { valor: "terminados", texto: "Terminados" },
];

function Lista() {
  const router = useRouter();
  const params = useSearchParams();
  const grupo = (params.get("grupo") as Grupo) || "todos";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [entrega, setEntrega] = useState(params.get("entrega") ?? "");
  const [busqueda, setBusqueda] = useState(q);

  useEffect(() => {
    const t = setTimeout(() => setBusqueda(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const ruta = `/vendedor/pedidos?grupo=${grupo}&entrega=${entrega}&q=${encodeURIComponent(busqueda)}`;
  const { datos, cargando } = useApi<{ pedidos: PedidoResumen[]; conteo: Record<string, number> }>(ruta);

  return (
    <>
      <Encabezado titulo="Pedidos" detalle="Los pedidos donde te toca hacer algo salen primero. Llegan pagados: acepta, prepara y envía." />
      <div className="mb-4">
        <Chips
          opciones={grupos.map((g) => ({ ...g, n: g.valor === "todos" || g.valor === "terminados" ? undefined : datos?.conteo[g.valor] }))}
          valor={grupo}
          onChange={(g) => router.replace(`/vendedor/pedidos?grupo=${g}`)}
        />
      </div>
      <Tarjeta className="p-0">
        <div className="flex flex-col gap-2 border-b border-linea p-4 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="absolute left-3.5 top-3.5 size-4 text-gris" />
            <Entrada value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cliente o número…" className="pl-10" />
          </div>
          <Selector value={entrega} onChange={(e) => setEntrega(e.target.value)} className="sm:w-48">
            <option value="">Entrega: todas</option>
            <option value="recojo">Recojo en tienda</option>
            <option value="agencia">Agencia</option>
            <option value="motorizado">Motorizado</option>
          </Selector>
          <span className="text-sm text-gris sm:ml-auto">{datos?.pedidos.length ?? 0} registros</span>
        </div>
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.pedidos.length ? (
          <div className="p-4">
            <Vacio icono={<ClipboardList className="size-6" />} titulo="No hay pedidos aquí" detalle={grupo === "todos" ? "Comparte el enlace de tu tienda para recibir tus primeros pedidos." : "Cuando haya pedidos en este paso aparecerán aquí."} />
          </div>
        ) : (
          <TablaPedidos pedidos={datos.pedidos} />
        )}
      </Tarjeta>
    </>
  );
}

export default function Pedidos() {
  return (
    <Suspense>
      <Lista />
    </Suspense>
  );
}
