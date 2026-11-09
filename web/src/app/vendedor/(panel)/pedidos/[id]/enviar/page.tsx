"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { CalendarDays, Camera, Check, ChevronRight, FileText, Info, Loader2, Wallet } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { subirImagen } from "@/lib/subir";
import type { PedidoDetalle, Tienda } from "@/lib/tipos";
import { Boton, Cargando, Entrada, Selector, cn, useAvisar } from "@/components/ui";
import { usePanel } from "@/components/panel/contexto";

const OTRO = "otro";

// Pantalla de despacho del prototipo: agencia, motorizado o recojo listo.
export default function EnviarPedido({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const avisar = useAvisar();
  const { recargarResumen } = usePanel();
  const { datos: p } = useApi<PedidoDetalle>(`/vendedor/pedidos/${id}`);
  const { datos: t } = useApi<Tienda>("/vendedor/tienda");
  const ia = useApi<{ quedan: number }>("/vendedor/ia");

  const [agencia, setAgencia] = useState("");
  const [codigo, setCodigo] = useState("");
  const [clave, setClave] = useState("");
  const [boleta, setBoleta] = useState<{ key: string; url: string; nombre: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [moto, setMoto] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: "", celular: "", guardar: true });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (p && !agencia) setAgencia(p.agencia || t?.entrega.agencias[0] || "Shalom");
    if (p && !moto) setMoto(p.motorizados_guardados.length ? "0" : OTRO);
  }, [p, t, agencia, moto]);

  if (!p || !t) return <Cargando />;
  const pedido = p;
  const nombre = p.comprador.split(" ")[0];
  const unidades = p.items_detalle.reduce((s, x) => s + x.cantidad, 0);
  const migas = (
    <p className="flex items-center gap-1.5 text-sm text-gris">
      <Link href="/vendedor/pedidos" className="hover:text-pino">Pedidos</Link> <ChevronRight className="size-3.5" />
      <Link href={`/vendedor/pedidos/${id}`} className="hover:text-pino">{p.codigo}</Link> <ChevronRight className="size-3.5" /> Enviar
    </p>
  );

  if (p.estado !== "preparando") {
    return (
      <div className="space-y-5">
        {migas}
        <div className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <p className="font-bold text-tinta">Este pedido ya no está por despachar.</p>
          <p className="mt-1 text-sm text-gris">Estado actual: {p.estado_texto}.</p>
          <Link href={`/vendedor/pedidos/${id}`} className="mt-4 inline-block"><Boton>Ver pedido</Boton></Link>
        </div>
      </div>
    );
  }

  async function subir(file: File | undefined, conIA: boolean) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      setError("Sube una foto (JPG o PNG) de la boleta.");
      return;
    }
    setError("");
    setSubiendo(true);
    try {
      const f = await subirImagen(file, "boleta");
      setBoleta({ ...f, nombre: file.name });
      if (conIA) await leer(f.key);
    } catch (e) {
      avisar((e as Error).message, "error");
    } finally {
      setSubiendo(false);
    }
  }

  async function leer(key: string) {
    setLeyendo(true);
    try {
      const r = await api.post<{ datos: { agencia?: string; numero_orden: string; clave_recojo: string } }>("/vendedor/ia/leer-boleta", { boleta_key: key });
      if (r.datos.numero_orden) setCodigo(r.datos.numero_orden);
      if (r.datos.clave_recojo) setClave(r.datos.clave_recojo);
      if (r.datos.agencia && opciones.includes(r.datos.agencia)) setAgencia(r.datos.agencia);
      ia.recargar();
      avisar("La IA llenó el código y la clave. Revisa que coincidan con la boleta.");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setLeyendo(false);
    }
  }

  async function guardar() {
    setError("");
    let cuerpo: Record<string, unknown> = {};
    let ruta = "enviar";
    let mensaje = "";
    if (pedido.entrega === "agencia") {
      if (!codigo.trim() && !boleta) {
        setError("Escribe el código o sube la foto de la boleta de envío (es tu prueba si hay reclamo).");
        return;
      }
      cuerpo = { agencia, numero_orden: codigo.trim(), clave_recojo: clave.trim(), boleta_key: boleta?.key ?? "" };
      mensaje = `Listo: enviado por ${agencia}. Avisamos a ${nombre}.`;
    } else if (pedido.entrega === "motorizado") {
      const elegido = moto === OTRO ? { ...nuevo, celular: nuevo.celular.replace(/\D/g, "") } : { ...pedido.motorizados_guardados[Number(moto)], guardar: false };
      if (!elegido.nombre?.trim() || !/^9\d{8}$/.test(elegido.celular ?? "")) {
        setError("Escribe el nombre y el celular (9 dígitos) de quien lleva el pedido.");
        return;
      }
      cuerpo = { motorizado_nombre: elegido.nombre.trim(), motorizado_celular: elegido.celular, guardar: elegido.guardar };
      mensaje = `Listo: va en camino. ${nombre} ya ve quién lo lleva.`;
    } else {
      ruta = "listo-recojo";
      mensaje = `Avisamos a ${nombre} que ya puede recoger.`;
    }
    setGuardando(true);
    try {
      await api.post(`/vendedor/pedidos/${id}/${ruta}`, cuerpo);
      recargarResumen();
      avisar(mensaje);
      router.push(`/vendedor/pedidos/${id}`);
    } catch (e) {
      setError((e as ErrorApi).message);
      setGuardando(false);
    }
  }

  const opciones = Array.from(new Set([...(t.entrega.agencias.length ? t.entrega.agencias : ["Shalom"]), ...(p.agencia ? [p.agencia] : [])]));
  const resumen = (
    <div className="flex items-center gap-2.5 text-sm text-gris">
      {p.items_detalle.slice(0, 4).map((it, i) => (
        <span key={i} className="size-9 overflow-hidden rounded-lg bg-arena">{it.imagen_url && <img src={it.imagen_url} alt="" className="size-full object-cover" />}</span>
      ))}
      <span>{unidades} producto(s) para {p.comprador}</span>
    </div>
  );
  const despues = (
    <div className="flex gap-3 rounded-2xl bg-pino-claro px-4 py-3 text-sm text-tinta">
      <Check className="mt-0.5 size-4 shrink-0" />
      <span>
        Después de esto <b>no tienes que hacer nada más</b>.{" "}
        {p.pago_estado === "pendiente" ? `Te avisamos apenas ${nombre} pague.` : `${nombre} confirmará cuando lo reciba; si no, se confirma solo en 7 días.`}
      </span>
    </div>
  );
  const botones = (texto: string) => (
    <div className="flex flex-wrap gap-3">
      <Boton variante="acento" tamano="lg" cargando={guardando} onClick={guardar}>{texto}</Boton>
      <Link href={`/vendedor/pedidos/${id}`}><Boton variante="secundario" tamano="lg">Ahora no</Boton></Link>
    </div>
  );
  const encabezado = (titulo: string, sub: string) => (
    <div>
      <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
      <h1 className="text-[34px] font-extrabold leading-tight text-pino">{titulo}</h1>
      <p className="text-sm text-gris">{sub}</p>
    </div>
  );
  const errorBox = error && <p className="rounded-xl bg-error-claro px-4 py-2.5 text-sm text-error">{error}</p>;

  // ---------- Agencia ----------
  if (p.entrega === "agencia") {
    return (
      <div className="space-y-5">
        {migas}
        {encabezado("¿Ya lo dejaste en la agencia?", `Pedido ${p.codigo}`)}

        <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <h3 className="mb-2 text-lg font-extrabold text-tinta">Datos para la guía de la agencia</h3>
          <FilaCopiar k="Destinatario" v={p.comprador} />
          <FilaCopiar k="DNI" v={p.comprador_dni} />
          <FilaCopiar k="Celular" v={p.comprador_celular} />
          <FilaCopiar k="Agencia destino" v={[p.agencia_sede || p.agencia, p.ciudad].filter(Boolean).join(", ")} />
          <Link href={`/vendedor/pedidos/${id}/etiqueta`} className="mt-4 inline-block">
            <Boton variante="secundario" tamano="sm"><FileText className="size-4" /> Imprimir etiqueta</Boton>
          </Link>
        </section>

        <section className="space-y-5 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          {resumen}
          <label className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-coral/60 bg-coral-claro/70 px-4 py-3.5", (subiendo || leyendo) && "opacity-70")}>
            <span className="min-w-0 flex-1">
              <b className="flex items-center gap-2 text-sm text-tinta">{leyendo || subiendo ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Leer boleta con IA</b>
              <span className="text-xs text-gris">Toma foto y se llenan el código y la clave · 2 créditos{ia.datos ? ` (te quedan ${ia.datos.quedan})` : ""}</span>
            </span>
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={subiendo || leyendo} onChange={(e) => subir(e.target.files?.[0], true)} />
          </label>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-tinta" htmlFor="ds-ag">Agencia</label>
            <Selector id="ds-ag" value={agencia} onChange={(e) => setAgencia(e.target.value)}>
              {opciones.map((a) => <option key={a}>{a}</option>)}
            </Selector>
          </div>

          <div className="flex gap-3 rounded-2xl bg-aviso-claro px-4 py-3 text-sm text-tinta">
            <Info className="mt-0.5 size-4 shrink-0 text-aviso" />
            <span><b className="text-aviso">Tu cliente necesita el código para recoger su paquete.</b> Escribe el código o sube la foto de la boleta de envío (es tu prueba si hay reclamo): con uno basta.</span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-tinta" htmlFor="ds-track">Código de envío</label>
              <Entrada id="ds-track" value={codigo} maxLength={40} onChange={(e) => { setCodigo(e.target.value); setError(""); }} placeholder="Ej. SH123456789" />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-tinta">Foto del comprobante</span>
              <label className="flex h-[46px] cursor-pointer items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-tinta ring-1 ring-linea hover:bg-crema">
                {subiendo ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} {boleta ? "Cambiar foto" : "Tomar o subir foto"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => subir(e.target.files?.[0], false)} />
              </label>
              {boleta && (
                <a href={boleta.url} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1.5 text-sm text-pino underline">
                  <FileText className="size-4" /> {boleta.nombre}
                </a>
              )}
            </div>
          </div>

          <div className="max-w-xs">
            <label className="mb-1.5 block text-sm font-semibold text-tinta" htmlFor="ds-key">Clave de recojo <span className="font-normal text-gris">(opcional)</span></label>
            <Entrada id="ds-key" value={clave} maxLength={20} onChange={(e) => setClave(e.target.value)} placeholder="Si la agencia te pide una clave" />
            <p className="mt-1 text-xs text-gris">Solo la verá tu cliente.</p>
          </div>

          <p className="flex items-center gap-1.5 text-sm text-gris">
            <CalendarDays className="size-4" /> Fecha de envío: hoy, {new Date().toLocaleDateString("es-PE")} (se registra sola)
          </p>
          {errorBox}
          {despues}
          {botones("Listo, ya lo envié")}
        </section>
      </div>
    );
  }

  // ---------- Motorizado ----------
  if (p.entrega === "motorizado") {
    return (
      <div className="space-y-5">
        {migas}
        {encabezado("¿Ya salió con el motorizado?", `Pedido ${p.codigo}`)}
        <section className="space-y-5 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          {resumen}
          <div className="rounded-2xl bg-crema px-4 py-3 text-sm">
            <b className="text-tinta">Entregar en:</b> {[p.direccion, p.distrito].filter(Boolean).join(", ")}
            {p.referencia && <span className="text-gris"> · {p.referencia}</span>}
            <span className="text-gris"> · Cel. {p.comprador_celular}</span>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-tinta" htmlFor="ds-rider">¿Quién lo lleva?</label>
            <Selector id="ds-rider" value={moto} onChange={(e) => setMoto(e.target.value)}>
              {p.motorizados_guardados.map((r, i) => (
                <option key={r.celular} value={String(i)}>{r.nombre} · {r.celular}</option>
              ))}
              <option value={OTRO}>Otro motorizado…</option>
            </Selector>
            <p className="mt-1 text-xs text-gris">Tu cliente verá su nombre y celular.</p>
          </div>
          {moto === OTRO && (
            <div className="space-y-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-tinta" htmlFor="ds-name">Nombre</label>
                  <Entrada id="ds-name" value={nuevo.nombre} maxLength={60} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-tinta" htmlFor="ds-phone">Celular</label>
                  <Entrada id="ds-phone" inputMode="numeric" value={nuevo.celular} maxLength={11} onChange={(e) => setNuevo({ ...nuevo, celular: e.target.value })} placeholder="9XX XXX XXX" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={nuevo.guardar} onChange={(e) => setNuevo({ ...nuevo, guardar: e.target.checked })} className="size-4 accent-pino" />
                Guardarlo en mis motorizados
              </label>
            </div>
          )}
          {p.pago_estado === "pendiente" && (
            <div className="flex gap-3 rounded-2xl bg-aviso-claro px-4 py-3 text-sm text-tinta">
              <Wallet className="mt-0.5 size-4 shrink-0 text-aviso" />
              <span>{nombre} paga <b>{soles(p.total_centimos)}</b> desde su app cuando lo reciba. Tu motorizado no tiene que cobrar en efectivo.</span>
            </div>
          )}
          {errorBox}
          {despues}
          {botones("Listo, ya salió")}
        </section>
      </div>
    );
  }

  // ---------- Recojo ----------
  return (
    <div className="space-y-5">
      {migas}
      {encabezado("¿Ya está listo para recoger?", `Pedido ${p.codigo}`)}
      <section className="space-y-5 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
        {resumen}
        <div className="rounded-2xl bg-crema px-4 py-3">
          <b className="text-sm text-tinta">Le enviaremos a {nombre}:</b>
          <p className="mt-1 text-sm">
            “Tu pedido está listo. Te esperamos en {t.entrega.direccion_recojo || "la tienda"}
            {t.horario ? ` (${t.horario})` : ""}. Muestra tu código de recojo al llegar.”
          </p>
        </div>
        <p className="text-sm text-gris">Cuando {nombre} llegue, pídele su código de 4 dígitos y marca “Entregar al cliente”.</p>
        {errorBox}
        {botones("Sí, avisar que está listo")}
      </section>
    </div>
  );
}

function FilaCopiar({ k, v }: { k: string; v: string }) {
  const avisar = useAvisar();
  if (!v) return null;
  return (
    <div className="flex items-center gap-4 border-b border-linea py-2.5 text-sm last:border-0">
      <span className="w-32 shrink-0 text-gris">{k}</span>
      <b className="min-w-0 flex-1 text-tinta">{v}</b>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(v);
          avisar(`${k} copiado`);
        }}
        className="shrink-0 font-semibold text-tinta underline underline-offset-2"
      >
        Copiar
      </button>
    </div>
  );
}
