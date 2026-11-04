"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Tag, Trash2 } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { fecha, soles } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";
import { Boton, Campo, Cargando, Encabezado, Entrada, Modal, Selector, Tarjeta, useAvisar } from "@/components/ui";
import { FormularioProducto } from "@/components/productos/formulario";

export default function EditarProducto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const avisar = useAvisar();
  const { datos: p, setDatos } = useApi<Producto>(`/vendedor/productos/${id}`);
  const [oferta, setOferta] = useState({ pct: "15", dias: "3" });
  const [borrar, setBorrar] = useState(false);

  if (!p) return <Cargando />;

  async function guardarOferta() {
    try {
      setDatos(await api.put<Producto>(`/vendedor/productos/${id}/oferta`, { descuento_pct: Number(oferta.pct), dias: Number(oferta.dias) }));
      avisar("Oferta activada. Se ve en tu tienda con el precio rebajado.");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }
  async function quitarOferta() {
    setDatos(await api.del<Producto>(`/vendedor/productos/${id}/oferta`));
    avisar("Oferta terminada.");
  }
  async function eliminar() {
    await api.del(`/vendedor/productos/${id}`);
    avisar("Producto eliminado.");
    router.replace("/vendedor/productos");
  }

  return (
    <div className="space-y-5">
      <Link href="/vendedor/productos" className="inline-flex items-center gap-1 text-sm font-semibold text-pino">
        <ArrowLeft className="size-4" /> Productos
      </Link>
      <Encabezado titulo={p.nombre}>
        <Boton variante="peligro" onClick={() => setBorrar(true)}>
          <Trash2 className="size-4" /> Eliminar
        </Boton>
      </Encabezado>

      <Tarjeta className="flex flex-wrap items-center gap-4">
        <span className="grid size-11 place-items-center rounded-xl bg-coral-claro text-coral">
          <Tag className="size-5" />
        </span>
        {p.oferta ? (
          <>
            <div className="flex-1">
              <p className="font-semibold">
                En oferta: -{p.oferta.descuento_pct}% · {soles(p.oferta.precio_final_centimos)}
              </p>
              <p className="text-sm text-gris">Termina el {fecha(p.oferta.termina_en, true)}</p>
            </div>
            <Boton variante="secundario" onClick={quitarOferta}>
              Terminar oferta
            </Boton>
          </>
        ) : (
          <>
            <div className="min-w-48 flex-1">
              <p className="font-semibold">Ponlo en oferta</p>
              <p className="text-sm text-gris">Aparece en “Ofertas por tiempo limitado”.</p>
            </div>
            <Campo etiqueta="Descuento">
              <Selector value={oferta.pct} onChange={(e) => setOferta({ ...oferta, pct: e.target.value })} className="w-28">
                {[10, 15, 20, 25, 30, 40, 50].map((n) => (
                  <option key={n} value={n}>-{n}%</option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Durante">
              <Selector value={oferta.dias} onChange={(e) => setOferta({ ...oferta, dias: e.target.value })} className="w-32">
                {[1, 2, 3, 7, 14].map((n) => (
                  <option key={n} value={n}>{n === 1 ? "1 día" : `${n} días`}</option>
                ))}
              </Selector>
            </Campo>
            <Boton variante="acento" onClick={guardarOferta} className="self-end">
              Activar
            </Boton>
          </>
        )}
      </Tarjeta>

      <FormularioProducto key={p.id + p.imagenes.length} producto={p} />

      <Modal abierto={borrar} onCerrar={() => setBorrar(false)} titulo="¿Eliminar este producto?">
        <p className="mb-5 text-sm text-gris">Ya no aparecerá en tu tienda. Los pedidos anteriores se mantienen.</p>
        <div className="flex gap-2">
          <Boton variante="secundario" bloque onClick={() => setBorrar(false)}>
            Cancelar
          </Boton>
          <Boton variante="peligro" bloque onClick={eliminar}>
            Sí, eliminar
          </Boton>
        </div>
      </Modal>
    </div>
  );
}
