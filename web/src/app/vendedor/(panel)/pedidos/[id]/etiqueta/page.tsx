"use client";

import Image from "next/image";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Printer } from "lucide-react";
import { useApi } from "@/lib/api";
import { Boton, Cargando } from "@/components/ui";

type Etiqueta = {
  codigo: string; entrega: string; remitente: string; remitente_celular: string; destinatario: string; celular: string; dni: string;
  direccion: string; distrito: string; ciudad: string; referencia: string; agencia: string; agencia_sede: string;
};

// Etiqueta para pegar en el paquete. Por privacidad no muestra qué contiene.
export default function EtiquetaPedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { datos: e } = useApi<Etiqueta>(`/vendedor/pedidos/${id}/etiqueta`);
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (e) QRCode.toDataURL(e.codigo, { margin: 0, width: 160 }).then(setQr);
  }, [e]);
  if (!e) return <Cargando />;

  return (
    <div className="space-y-5">
      <div className="no-imprimir flex items-center justify-between">
        <Link href={`/vendedor/pedidos/${id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-pino">
          <ArrowLeft className="size-4" /> Volver al pedido
        </Link>
        <Boton onClick={() => window.print()}>
          <Printer className="size-4" /> Imprimir
        </Boton>
      </div>
      <div className="mx-auto w-[10cm] rounded-xl border-2 border-tinta bg-white p-5 text-[13px] leading-snug">
        <div className="flex items-center justify-between border-b-2 border-dashed border-tinta pb-3">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={28} height={28} />
            <span className="font-display text-lg font-extrabold">VendiGo</span>
          </div>
          <span className="font-display text-lg font-extrabold">{e.codigo}</span>
        </div>
        <div className="py-3">
          <p className="text-[11px] font-bold uppercase">Para</p>
          <p className="font-display text-xl font-extrabold">{e.destinatario}</p>
          {e.dni && <p>DNI: {e.dni}</p>}
          <p>Cel.: {e.celular}</p>
          {e.entrega === "agencia" ? (
            <p className="mt-1 font-semibold">{e.agencia_sede || `${e.agencia} · ${e.ciudad}`}</p>
          ) : (
            <p className="mt-1">
              {e.direccion}
              {e.distrito && `, ${e.distrito}`}
              {e.ciudad && `, ${e.ciudad}`}
              {e.referencia && <><br />Ref.: {e.referencia}</>}
            </p>
          )}
        </div>
        <div className="flex items-end justify-between border-t-2 border-dashed border-tinta pt-3">
          <div>
            <p className="text-[11px] font-bold uppercase">De</p>
            <p className="font-semibold">{e.remitente}</p>
            {e.remitente_celular && <p>Cel.: {e.remitente_celular}</p>}
          </div>
          {qr && <img src={qr} alt="" className="size-20" />}
        </div>
      </div>
      <p className="no-imprimir text-center text-sm text-gris">Recórtala y pégala en el paquete. No indica el contenido, por privacidad.</p>
    </div>
  );
}
