"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Package, Pencil, Search, Trash2 } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import type { Producto, Tienda, UsoPlan } from "@/lib/tipos";
import { Boton, Cargando, Encabezado, Entrada, Insignia, Modal, Selector, Tarjeta, Vacio, useAvisar } from "@/components/ui";

type Filtro = "todos" | "activos" | "pausados" | "sin_stock" | "stock_bajo" | "en_oferta";

function estado(p: Producto) {
  if (p.stock === 0) return <Insignia tono="error">Agotado</Insignia>;
  if (!p.activo) return <Insignia>Pausado</Insignia>;
  return <Insignia tono="pino">Publicado</Insignia>;
}

function Lista() {
  const router = useRouter();
  const params = useSearchParams();
  const avisar = useAvisar();
  const filtro = (params.get("filtro") as Filtro) || "todos";
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [borrar, setBorrar] = useState<Producto | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { datos, cargando, recargar } = useApi<{ productos: Producto[]; conteo: Record<string, number> }>(`/vendedor/productos?filtro=${filtro}&q=${encodeURIComponent(busqueda)}`);
  const plan = useApi<UsoPlan>("/vendedor/plan");
  const tienda = useApi<Tienda>("/vendedor/tienda");

  async function eliminar() {
    if (!borrar) return;
    try {
      await api.del(`/vendedor/productos/${borrar.id}`);
      avisar("Producto eliminado.");
      setBorrar(null);
      recargar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    }
  }

  return (
    <>
      <Encabezado titulo="Productos" detalle={`${datos?.conteo.todos ?? 0} productos${plan.datos ? ` · plan ${plan.datos.plan.nombre}` : ""}`}>
        <Link href="/vendedor/productos/nuevo">
          <Boton variante="acento">+ Nuevo producto</Boton>
        </Link>
      </Encabezado>
      <Tarjeta className="p-0">
        <div className="flex flex-col gap-2 border-b border-linea p-4 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="absolute left-3.5 top-3.5 size-4 text-gris" />
            <Entrada value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" className="pl-10" />
          </div>
          <Selector value={filtro} onChange={(e) => router.replace(`/vendedor/productos?filtro=${e.target.value}`)} className="sm:w-52">
            <option value="todos">Estado: todos</option>
            <option value="activos">Publicados</option>
            <option value="pausados">Pausados</option>
            <option value="sin_stock">Agotados</option>
            <option value="stock_bajo">Stock bajo</option>
            <option value="en_oferta">En oferta</option>
          </Selector>
          <span className="text-sm text-gris sm:ml-auto">{datos?.productos.length ?? 0} registros</span>
        </div>
        {cargando && !datos ? (
          <Cargando />
        ) : !datos?.productos.length ? (
          <div className="p-4">
            <Vacio icono={<Package className="size-6" />} titulo={filtro === "todos" && !busqueda ? "Aún no publicas productos" : "No hay productos aquí"} detalle="Con una foto, la IA te ayuda a completar el nombre y la descripción.">
              {filtro === "todos" && (
                <Link href="/vendedor/productos/nuevo">
                  <Boton variante="acento">Publicar mi primer producto</Boton>
                </Link>
              )}
            </Vacio>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gris">
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Precio</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Vendidos</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {datos.productos.map((p) => (
                  <tr key={p.id} className="hover:bg-crema/60">
                    <td className="px-4 py-3">
                      <Link href={`/vendedor/productos/${p.id}`} className="flex items-center gap-3">
                        <span className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-arena">
                          {p.imagenes[0] && <img src={p.imagenes[0].url} alt="" className="size-full object-cover" />}
                          {p.oferta && <span className="absolute left-0 top-0 rounded-br-md bg-coral px-1 text-[10px] font-bold text-white">-{p.oferta.descuento_pct}%</span>}
                        </span>
                        <span>
                          <span className="block font-semibold">{p.nombre}</span>
                          <span className="block text-xs text-gris">{p.variantes.length ? `${p.variantes.length} variantes` : "Sin variantes"}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">{soles(p.oferta?.precio_final_centimos ?? p.precio_centimos)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${p.stock === 0 ? "text-error" : p.stock <= 3 ? "text-aviso" : ""}`}>{p.stock}</td>
                    <td className="px-4 py-3">{estado(p)}</td>
                    <td className="px-4 py-3 text-right">{p.vendidos}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {tienda.datos && (
                          <Link href={`/vendedor/productos/${p.id}/vista`} className="grid size-8 place-items-center rounded-full ring-1 ring-linea hover:bg-crema" title="Vista previa">
                            <Eye className="size-4" />
                          </Link>
                        )}
                        <Link href={`/vendedor/productos/${p.id}`} className="grid size-8 place-items-center rounded-full ring-1 ring-linea hover:bg-crema" title="Editar">
                          <Pencil className="size-4" />
                        </Link>
                        <button onClick={() => setBorrar(p)} className="grid size-8 place-items-center rounded-full ring-1 ring-linea hover:bg-error-claro" title="Eliminar">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      <Modal abierto={!!borrar} onCerrar={() => setBorrar(null)} titulo="¿Eliminar este producto?">
        <p className="mb-5 text-sm text-gris">“{borrar?.nombre}” ya no aparecerá en tu tienda. Los pedidos anteriores se mantienen.</p>
        <div className="flex gap-2">
          <Boton variante="secundario" bloque onClick={() => setBorrar(null)}>Cancelar</Boton>
          <Boton variante="peligro" bloque onClick={eliminar}>Sí, eliminar</Boton>
        </div>
      </Modal>
    </>
  );
}

export default function Productos() {
  return (
    <Suspense>
      <Lista />
    </Suspense>
  );
}
