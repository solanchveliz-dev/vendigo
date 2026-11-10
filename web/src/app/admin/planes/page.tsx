"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronRight, Info } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { Boton, Cargando, cn, useAvisar } from "@/components/ui";
import { Titulo } from "@/components/admin/ui";

type Plan = {
  id: string;
  nombre: string;
  precio_centimos: number;
  ventas_mes: number | null;
  creditos_ia: number;
  productos_max: number | null;
  disponible: boolean;
  tiendas: number;
};
type Form = { precio: string; ia: string; ventas: string; productos: string; disponible: boolean };

const aForm = (p: Plan): Form => ({
  precio: String(p.precio_centimos / 100),
  ia: String(p.creditos_ia),
  ventas: p.ventas_mes == null ? "" : String(p.ventas_mes),
  productos: p.productos_max == null ? "" : String(p.productos_max),
  disponible: p.disponible,
});
const num = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));

function Campo({ etiqueta, opcional, ayuda, prefijo, valor, cambiar, deshabilitado }: { etiqueta: string; opcional?: boolean; ayuda?: string; prefijo?: string; valor: string; cambiar: (v: string) => void; deshabilitado?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-tinta">
        {etiqueta} {opcional && <span className="font-normal text-gris">(vacío = ilimitado)</span>}
      </span>
      <span className={cn("flex h-12 items-center overflow-hidden rounded-xl border border-linea bg-white focus-within:border-pino", deshabilitado && "bg-crema/60")}>
        {prefijo && <span className="grid h-full place-items-center border-r border-linea px-3 text-sm text-gris">{prefijo}</span>}
        <input inputMode="numeric" value={valor} disabled={deshabilitado} onChange={(e) => cambiar(e.target.value.replace(/[^\d.]/g, ""))} className="h-full w-full bg-transparent px-3 text-[15px] outline-none" />
      </span>
      {ayuda && <span className="mt-1 block text-xs text-gris">{ayuda}</span>}
    </label>
  );
}

function TarjetaPlan({ plan, alGuardar }: { plan: Plan; alGuardar: () => void }) {
  const avisar = useAvisar();
  const [f, setF] = useState<Form>(aForm(plan));
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setF(aForm(plan)), [plan]);
  const cambiado = JSON.stringify(f) !== JSON.stringify(aForm(plan));
  const gratis = plan.id === "gratis";

  // Lo que incluye el plan según los límites (lo mismo que aplica el sistema).
  const ventas = num(f.ventas), productos = num(f.productos), ia = num(f.ia) ?? 0;
  const incluye = [
    ventas == null ? "Ventas ilimitadas" : `${ventas} ventas al mes`,
    productos == null ? "Productos ilimitados" : `Hasta ${productos} productos`,
    `IA: ${ia.toLocaleString("es-PE")} créditos al mes`,
    "Pedidos con seguimiento",
  ];

  async function guardar() {
    setGuardando(true);
    try {
      const r = await api.put<{ mensaje: string }>(`/admin/planes/${plan.id}`, {
        precio_centimos: Math.round(Number(f.precio || 0) * 100),
        creditos_ia: ia,
        ventas_mes: ventas,
        productos_max: productos,
        disponible: f.disponible,
      });
      avisar(r.mensaje);
      alGuardar();
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className={cn("flex flex-col rounded-[22px] bg-white p-6 ring-1 ring-linea/70", !f.disponible && "opacity-80")}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-tinta">{plan.nombre}</h3>
        <button
          role="switch"
          aria-checked={f.disponible}
          aria-label={f.disponible ? "Plan disponible" : "Plan pausado"}
          disabled={gratis}
          onClick={() => setF({ ...f, disponible: !f.disponible })}
          className={cn("relative h-7 w-12 rounded-full transition", f.disponible ? "bg-coral" : "bg-linea", gratis && "cursor-not-allowed")}
        >
          <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition", f.disponible ? "left-6" : "left-1")} />
        </button>
      </div>
      <div className="space-y-4">
        <Campo etiqueta="Precio mensual" prefijo="S/" valor={f.precio} cambiar={(v) => setF({ ...f, precio: v })} deshabilitado={gratis} />
        <Campo etiqueta="Usos de IA al mes" ayuda="Se renuevan cada mes" valor={f.ia} cambiar={(v) => setF({ ...f, ia: v })} />
        <Campo etiqueta="Ventas al mes" opcional valor={f.ventas} cambiar={(v) => setF({ ...f, ventas: v })} />
        <Campo etiqueta="Productos publicados" opcional valor={f.productos} cambiar={(v) => setF({ ...f, productos: v })} />
      </div>
      <p className="mb-2 mt-5 text-sm font-semibold text-tinta">Incluye</p>
      <ul className="space-y-1.5 text-sm text-tinta">
        {incluye.map((t) => (
          <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-pino" /> {t}</li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-gris">
        {plan.tiendas.toLocaleString("es-PE")} {plan.tiendas === 1 ? "tienda suscrita" : "tiendas suscritas"}
        {!f.disponible && " · pausado: nadie nuevo puede elegirlo"}
      </p>
      <div className="mt-auto pt-5">
        <Boton bloque onClick={guardar} cargando={guardando} disabled={!cambiado}>Guardar cambios</Boton>
      </div>
    </section>
  );
}

export default function Planes() {
  const { datos, recargar } = useApi<{ planes: Plan[] }>("/admin/planes");
  return (
    <>
      <Titulo
        migas={<><Link href="/admin/suscripciones" className="hover:text-pino">Suscripciones</Link> <ChevronRight className="size-3.5" /> Planes</>}
        titulo="Planes"
        detalle="Precios, límites y estado de cada plan. Lo que cambies aquí es lo que el sistema aplica a las tiendas."
      />
      {!datos ? (
        <Cargando />
      ) : (
        <>
          <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {datos.planes.map((p) => <TarjetaPlan key={p.id} plan={p} alGuardar={recargar} />)}
          </div>
          <p className="flex items-start gap-2 rounded-2xl bg-aviso-claro px-5 py-3 text-sm text-tinta">
            <Info className="mt-0.5 size-4 shrink-0 text-aviso" />
            Si cambias el precio, a las tiendas de ese plan les llega un aviso y el nuevo precio se aplica desde su siguiente cobro. Los límites se aplican al instante.
          </p>
        </>
      )}
    </>
  );
}
