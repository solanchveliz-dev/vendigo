"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Check, Clock, Copy, Radio } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { soles } from "@/lib/formato";
import { Aviso, Boton, Cargando, Encabezado, Tarjeta, cn, useAvisar } from "@/components/ui";

type Producto = { id: string; codigo: number | null; nombre: string; precio_centimos: number; stock: number; imagen_url: string };
type Separado = { pedido_id: string; codigo: string; comprador: string; producto: string; total_centimos: number; grupo: string; segundos_para_pagar: number; creado_en: string };
type Live = { activo: boolean; verificada: boolean; minutos: number; opciones_minutos: number[]; enlace: string; productos: Producto[]; tablero: Separado[] };

const COLUMNAS: { grupo: string; titulo: string; ayuda: string }[] = [
  { grupo: "separado", titulo: "Separados", ayuda: "Esperando que paguen" },
  { grupo: "por_revisar", titulo: "Pagos por revisar", ayuda: "Revisa tu Yape o Plin" },
  { grupo: "confirmado", titulo: "Confirmados", ayuda: "Pago confirmado: ya son pedidos" },
  { grupo: "vencido", titulo: "Vencidos", ayuda: "No pagaron: el stock volvió solo" },
];

function reloj(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Modo live: prender/apagar, elegir el tiempo para pagar y los productos, compartir el enlace, y un tablero que se
// actualiza solo. La vendedora no controla tiempos: el servidor cancela las separaciones que no se pagan.
export default function ModoLive() {
  const avisar = useAvisar();
  const { datos, setDatos, recargar } = useApi<Live>("/vendedor/live");
  const [elegidos, setElegidos] = useState<string[] | null>(null);
  const [minutos, setMinutos] = useState(5);
  const [guardando, setGuardando] = useState(false);
  const [qr, setQr] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (datos && elegidos === null) {
      setElegidos(datos.productos.filter((p) => p.codigo !== null).sort((a, b) => (a.codigo ?? 0) - (b.codigo ?? 0)).map((p) => p.id));
      setMinutos(datos.minutos);
    }
  }, [datos, elegidos]);
  useEffect(() => {
    if (datos?.enlace) QRCode.toDataURL(datos.enlace, { width: 200, margin: 1 }).then(setQr).catch(() => setQr(""));
  }, [datos?.enlace]);
  // Durante el live el tablero se actualiza cada 5 s; el reloj de cada separación baja cada segundo.
  useEffect(() => {
    if (!datos?.activo) return;
    const a = setInterval(recargar, 5000);
    const b = setInterval(() => setTick((x) => x + 1), 1000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [datos?.activo, recargar]);
  useEffect(() => setTick(0), [datos]);

  if (!datos || elegidos === null) return <Cargando />;
  const live = datos;
  const sel = elegidos;

  async function guardar(activo: boolean) {
    setGuardando(true);
    try {
      setDatos(await api.put<Live>("/vendedor/live", { activo, minutos, productos: sel }));
      avisar(activo ? (live.activo ? "Live actualizado." : "¡Tu live está activo! Comparte el enlace.") : "Live terminado. Las separaciones pendientes terminan su tiempo.");
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setGuardando(false);
    }
  }

  function alternar(id: string) {
    setElegidos(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  }

  const codigoDe = (id: string) => sel.indexOf(id) + 1;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Modo live" detalle="Vende en tu transmisión de TikTok, Facebook o Instagram: tus clientes separan desde el enlace y tienen unos minutos para pagar." />

      {!live.verificada && (
        <Aviso tono="aviso">
          Podrás hacer lives cuando VendiGo apruebe tu DNI: hasta entonces tu tienda no es visible para los compradores.{" "}
          <Link href="/vendedor/verificacion" className="font-semibold underline">Ver mi verificación</Link>
        </Aviso>
      )}
      {live.activo && (
        <Aviso tono="ok">
          <span className="flex flex-wrap items-center gap-2"><Radio className="size-4" /> <b>Estás en vivo.</b> Di en tu transmisión: “Código 12, sepáralo en el enlace”.</span>
        </Aviso>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <Tarjeta className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-tinta">Tiempo para pagar después de separar</p>
            <div className="flex flex-wrap gap-2">
              {live.opciones_minutos.map((m) => (
                <button key={m} onClick={() => setMinutos(m)}
                  className={cn("h-11 rounded-full px-5 text-sm font-bold ring-1 transition", minutos === m ? "bg-pino text-white ring-pino" : "bg-white text-tinta ring-linea hover:bg-crema")}>
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-tinta">Productos del live <span className="font-normal text-gris">(el número es el código que dirás)</span></p>
            <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {live.productos.map((p) => {
                const n = codigoDe(p.id);
                return (
                  <li key={p.id}>
                    <button onClick={() => alternar(p.id)}
                      className={cn("flex w-full items-center gap-3 rounded-2xl p-2 text-left ring-1 transition", n ? "bg-pino-claro ring-pino/40" : "bg-white ring-linea hover:bg-crema")}>
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold", n ? "bg-pino text-white" : "bg-arena text-gris")}>{n || "—"}</span>
                      <span className="size-10 shrink-0 overflow-hidden rounded-lg bg-arena">{p.imagen_url && <img src={p.imagen_url} alt="" className="size-full object-cover" />}</span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm text-tinta">{p.nombre}</b>
                        <span className="text-xs text-gris">{soles(p.precio_centimos)} · {p.stock} en stock</span>
                      </span>
                      {n > 0 && <Check className="size-4 text-pino" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-wrap gap-3">
            {live.activo ? (
              <>
                <Boton cargando={guardando} onClick={() => guardar(true)}>Guardar cambios</Boton>
                <Boton variante="secundario" cargando={guardando} onClick={() => guardar(false)}>Terminar live</Boton>
              </>
            ) : (
              <Boton variante="acento" tamano="lg" cargando={guardando} disabled={!sel.length || !live.verificada} onClick={() => guardar(true)}><Radio className="size-4" /> Empezar live</Boton>
            )}
          </div>
        </Tarjeta>

        {live.verificada && (
        <Tarjeta className="space-y-3 text-center">
          <p className="text-sm font-semibold text-tinta">Enlace para tu live</p>
          {qr && <img src={qr} alt="Código QR del enlace del live" className="mx-auto size-[200px] rounded-xl" />}
          <p className="break-all text-xs text-gris">{live.enlace}</p>
          <Boton variante="secundario" tamano="sm" onClick={() => navigator.clipboard?.writeText(live.enlace).then(() => avisar("Enlace copiado."))}><Copy className="size-4" /> Copiar enlace</Boton>
          <p className="text-xs text-gris">Fíjalo en tu transmisión o muestra el QR en pantalla.</p>
        </Tarjeta>
        )}
      </div>

      {live.tablero.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNAS.map((c) => {
            const items = live.tablero.filter((x) => x.grupo === c.grupo);
            return (
              <Tarjeta key={c.grupo}>
                <p className="font-extrabold text-tinta">{c.titulo} <span className="text-gris">({items.length})</span></p>
                <p className="mb-3 text-xs text-gris">{c.ayuda}</p>
                <ul className="space-y-2">
                  {items.slice(0, 50).map((x) => {
                    const quedan = Math.max(0, x.segundos_para_pagar - tick);
                    return (
                      <li key={x.pedido_id}>
                        <Link href={`/vendedor/pedidos/${x.pedido_id}`} className="block rounded-xl bg-crema/70 px-3 py-2 text-sm hover:bg-crema">
                          <span className="flex items-center justify-between gap-2">
                            <b className="truncate text-tinta">{x.comprador}</b>
                            {c.grupo === "separado" && <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-aviso"><Clock className="size-3.5" /> {reloj(quedan)}</span>}
                          </span>
                          <span className="block truncate text-xs text-gris">{x.producto} · {soles(x.total_centimos)} · {x.codigo}</span>
                        </Link>
                      </li>
                    );
                  })}
                  {!items.length && <li className="text-xs text-gris">Nada por ahora.</li>}
                </ul>
              </Tarjeta>
            );
          })}
        </div>
      )}
    </div>
  );
}
