"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ChevronRight } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { nombreEntrega } from "@/lib/formato";
import type { PedidoDetalle } from "@/lib/tipos";
import { Cargando, useAvisar } from "@/components/ui";
import { AvisoAccion, LineaTiempo } from "@/components/pedidos/pasos";
import { usePanel } from "@/components/panel/contexto";

// "Quién hace cada paso": los mismos pasos del pedido con quién los hace.
export default function EstadoPedidoPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: p, setDatos } = useApi<PedidoDetalle>(`/vendedor/pedidos/${id}`);
  const { recargarResumen } = usePanel();
  const avisar = useAvisar();
  const [ocupado, setOcupado] = useState(false);
  if (!p) return <Cargando />;

  const irAlPedido = () => (window.location.href = `/vendedor/pedidos/${id}`);
  async function aceptar() {
    setOcupado(true);
    try {
      setDatos(await api.post<PedidoDetalle>(`/vendedor/pedidos/${id}/aceptar`, {}));
      recargarResumen();
      avisar("Pedido aceptado. Ya puedes prepararlo.");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/pedidos" className="hover:text-pino">Pedidos</Link> <ChevronRight className="size-3.5" />
        <Link href={`/vendedor/pedidos/${id}`} className="hover:text-pino">{p.codigo}</Link> <ChevronRight className="size-3.5" /> Estado
      </p>
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Quién hace cada paso</h1>
        <p className="text-sm text-gris">
          Pedido {p.codigo} · {nombreEntrega[p.entrega]} · {p.pago?.texto ?? ""}
        </p>
      </div>
      <AvisoAccion pedido={p} ocupado={ocupado} alAceptar={aceptar} alRechazar={irAlPedido} alEntregar={irAlPedido} alResponder={irAlPedido} />
      <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
        <LineaTiempo pedido={p} modo="roles" />
      </section>
    </div>
  );
}
