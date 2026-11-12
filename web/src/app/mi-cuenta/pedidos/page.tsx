"use client";

import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/api";
import { Cargando, cn } from "@/components/ui";
import { Titulo } from "@/components/admin/ui";
import { FilaPedido, Vacio, type PedidoComprador } from "@/components/comprador/ui";

const PESTANAS = [
  ["todos", "Todos"],
  ["curso", "En curso"],
  ["entregado", "Entregados"],
  ["cancelado", "Cancelados"],
] as const;

// Mis pedidos: todas las compras del comprador, también las que hizo antes de crear su cuenta.
export default function MisPedidos() {
  const { datos } = useApi<{ pedidos: PedidoComprador[] }>("/comprador/pedidos");
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number][0]>("todos");
  const todos = datos?.pedidos ?? [];
  const lista = pestana === "todos" ? todos : todos.filter((p) => p.grupo === pestana);

  return (
    <div className="space-y-6">
      <Titulo titulo="Mis pedidos" detalle="Cada pedido va directo a un emprendedor. Tócalo para ver cómo pagar y en qué va." migas={<><Link href="/mi-cuenta" className="hover:text-tinta">Inicio</Link> / Mis pedidos</>} />
      {!datos ? (
        <Cargando />
      ) : !todos.length ? (
        <Vacio titulo="Todavía no tienes pedidos" texto="Cuando le pidas algo a un emprendedor, aquí verás el pago, la entrega y el código para recoger.">
          <Link href="/buscar" className="inline-flex h-11 items-center rounded-full bg-pino px-6 text-sm font-bold text-white">Buscar emprendedores</Link>
        </Vacio>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 border-b border-linea">
            {PESTANAS.map(([k, t]) => {
              const n = k === "todos" ? todos.length : todos.filter((p) => p.grupo === k).length;
              return (
                <button key={k} onClick={() => setPestana(k)} className={cn("-mb-px border-b-2 px-3 pb-3 text-[15px] font-semibold transition", pestana === k ? "border-coral text-tinta" : "border-transparent text-gris hover:text-tinta")}>
                  {t} ({n})
                </button>
              );
            })}
          </div>
          {lista.length ? (
            <div className="space-y-3">{lista.map((p) => <FilaPedido key={p.codigo} p={p} />)}</div>
          ) : (
            <Vacio titulo="Nada por aquí" texto="No tienes pedidos en este estado." />
          )}
        </>
      )}
    </div>
  );
}
