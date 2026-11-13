"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, LocateFixed, MapPin, PencilLine, Search } from "lucide-react";
import { Campo, Entrada, cn } from "@/components/ui";
import { distanciaKm, textoKm, type Punto } from "@/lib/ubicacion";

type Lugar = { nombre: string; direccion: string; ciudad: string; lat: number | null; lng: number | null; km?: number | null };
export type EleccionSede = { agencia: string; ciudad: string; sede: string };

// Sin tildes ni mayúsculas, para que "jesus maria" encuentre "Jesús María".
const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const textoSede = (s: Lugar) => `${s.nombre} · ${s.direccion}`.slice(0, 200);

// Elegir dónde recoger el envío por agencia:
//   1. "Buscar la Shalom más cercana a mí": agencias REALES alrededor del comprador, buscadas en vivo en OpenStreetMap
//      (mapa abierto y gratuito). Su ubicación se usa solo para esa búsqueda (redondeada a ~1 km) y no se guarda.
//   2. Escribir el distrito: busca entre las sedes confirmadas por VendiGo (las de ejemplo no se muestran).
//   3. Respaldo: abrir Google Maps con "agencia Shalom cerca de mí" (enlace, sin costo) y escribir la sede elegida.
export function ElegirSede({ agencias, valor, cambiar }: { agencias: string[]; valor: EleccionSede; cambiar: (v: EleccionSede) => void }) {
  const agencia = valor.agencia || agencias[0] || "";
  const [sedes, setSedes] = useState<Lugar[]>([]);
  const [cercanas, setCercanas] = useState<Lugar[] | null>(null);
  const [q, setQ] = useState("");
  const [yo, setYo] = useState<Punto | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [aMano, setAMano] = useState(false);

  // La primera agencia queda elegida sola si la tienda trabaja con una sola.
  useEffect(() => {
    if (!valor.agencia && agencia) cambiar({ agencia, ciudad: "", sede: "" });
  }, [valor.agencia, agencia, cambiar]);

  // Al cambiar de agencia se empieza de nuevo.
  useEffect(() => {
    setCercanas(null);
    setAviso("");
    setAMano(agencia === "Otra");
    if (!agencia || agencia === "Otra") return setSedes([]);
    fetch(`/api/v1/agencias/sedes?agencia=${encodeURIComponent(agencia)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { sedes: [] }))
      .then((d: { sedes: Lugar[] }) => setSedes(d.sedes ?? []))
      .catch(() => setSedes([]));
  }, [agencia]);

  async function buscarCerca(p: Punto) {
    const r = await fetch(`/api/v1/agencias/cerca?agencia=${encodeURIComponent(agencia)}&lat=${p.lat}&lng=${p.lng}`, { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? ((await r.json()) as { agencias: Lugar[]; disponible: boolean }) : null;
    // Se suman las sedes confirmadas por VendiGo que tengan ubicación, por si el mapa abierto no las tiene.
    const propias = sedes
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({ ...s, km: distanciaKm(p, { lat: s.lat!, lng: s.lng! }) }))
      .filter((s) => s.km < 8);
    const todas = [...(d?.agencias ?? []), ...propias]
      .filter((s, i, arr) => arr.findIndex((x) => plano(x.nombre) === plano(s.nombre)) === i)
      .sort((a, b) => (a.km ?? 99) - (b.km ?? 99));
    setCercanas(todas);
    if (!d?.disponible) setAviso(`Ahora no pudimos consultar el mapa de agencias. Búscala en Google Maps y escríbela abajo.`);
    else if (!todas.length) setAviso(`No encontramos agencias ${agencia} registradas en el mapa abierto cerca de ti. Búscala en Google Maps y escríbela abajo.`);
    if (todas[0]) cambiar({ agencia, ciudad: todas[0].ciudad, sede: textoSede(todas[0]) });
  }

  function ubicarme() {
    setAviso("");
    if (!window.isSecureContext) return setAviso("La ubicación solo funciona en páginas seguras (https o localhost). Escribe tu distrito o búscala en Google Maps.");
    if (!navigator.geolocation) return setAviso("Tu navegador no permite usar tu ubicación. Escribe tu distrito o búscala en Google Maps.");
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        const punto = { lat: p.coords.latitude, lng: p.coords.longitude };
        setYo(punto);
        setQ("");
        await buscarCerca(punto);
        setUbicando(false);
      },
      (e) => {
        setUbicando(false);
        setAviso(
          e.code === e.PERMISSION_DENIED
            ? "Bloqueaste el permiso de ubicación. Actívalo en el ícono a la izquierda de la dirección del navegador o escribe tu distrito."
            : e.code === e.TIMEOUT
              ? "Tu equipo tardó demasiado en encontrar tu ubicación. Vuelve a intentarlo o escribe tu distrito."
              : "Tu equipo no pudo saber dónde estás (pasa en computadoras sin Wi-Fi). Escribe tu distrito o búscala en Google Maps.",
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }

  // Al escribir un distrito se buscan las sedes confirmadas por VendiGo.
  const encontradas = useMemo(() => {
    const palabras = plano(q).split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    return sedes.filter((s) => palabras.every((w) => plano(`${s.ciudad} ${s.nombre} ${s.direccion}`).includes(w)));
  }, [sedes, q]);

  const lista = q ? encontradas : (cercanas ?? []);
  const elegir = (s: Lugar) => cambiar({ agencia, ciudad: s.ciudad, sede: textoSede(s) });
  const elegida = lista.find((s) => textoSede(s) === valor.sede);
  const googleMaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`agencia ${agencia} cerca de mí`)}`;

  if (!agencia) return <p className="text-sm text-gris sm:col-span-3">Esta tienda aún no indica con qué agencias envía. Escríbele antes de pedir.</p>;

  return (
    <div className="space-y-3 sm:col-span-3">
      {agencias.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Agencia">
          {agencias.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={a === agencia}
              onClick={() => cambiar({ agencia: a, ciudad: "", sede: "" })}
              className={cn("rounded-full px-4 py-2 text-sm font-bold transition", a === agencia ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea hover:bg-arena/60")}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      {agencia !== "Otra" && (
        <>
          <button
            type="button"
            onClick={ubicarme}
            disabled={ubicando}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral px-5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-70"
          >
            <LocateFixed className="size-4" /> {ubicando ? `Buscando agencias ${agencia} cerca de ti…` : `Buscar la ${agencia} más cercana a mí`}
          </button>
          {sedes.length > 0 && (
            <label className="flex h-11 items-center gap-2 rounded-full bg-white px-4 ring-1 ring-linea focus-within:ring-2 focus-within:ring-pino">
              <Search className="size-4 shrink-0 text-gris" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="O escribe tu distrito o ciudad" aria-label="Buscar sede por distrito o ciudad" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
          )}
          {aviso && <p className="text-sm text-aviso">{aviso}</p>}

          {!q && cercanas && cercanas.length > 0 && <Mapa lugares={cercanas} yo={yo} elegida={valor.sede} elegir={elegir} />}

          {q && !encontradas.length && <p className="text-sm text-gris">No tenemos sedes de {agencia} confirmadas con “{q}”. Búscala en Google Maps y escríbela abajo.</p>}

          {lista.length > 0 && (
            <ul className="space-y-2" role="radiogroup" aria-label={`Agencias ${agencia}`}>
              {lista.map((s, i) => {
                const activa = valor.sede === textoSede(s);
                return (
                  <li key={`${s.nombre}-${i}`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={activa}
                      onClick={() => elegir(s)}
                      className={cn("flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left ring-1 transition", activa ? "ring-2 ring-pino" : "ring-linea hover:ring-pino/50")}
                    >
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", activa ? "bg-pino text-white" : "bg-arena text-pino")}><MapPin className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <b className="block text-sm text-tinta">{s.nombre}</b>
                        <span className="block truncate text-xs text-gris">{[s.direccion, s.ciudad].filter(Boolean).join(", ")}</span>
                      </span>
                      {!q && i === 0 && <span className="shrink-0 rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white">Más cerca</span>}
                      {s.km != null && <span className="shrink-0 text-sm font-bold text-tinta">{textoKm(s.km)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Si la sede elegida no trae ciudad en el mapa, se pide (la agencia la necesita). */}
          {elegida && !elegida.ciudad && (
            <Campo etiqueta="Ciudad de la agencia"><Entrada value={valor.ciudad} onChange={(e) => cambiar({ ...valor, agencia, ciudad: e.target.value })} maxLength={80} placeholder="Ej. Lima" /></Campo>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <a href={googleMaps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-bold text-pino underline underline-offset-2">
              <ExternalLink className="size-4" /> ¿No ves tu agencia? Búscala en Google Maps
            </a>
            {!aMano && (
              <button type="button" onClick={() => { setAMano(true); cambiar({ agencia, ciudad: "", sede: "" }); }} className="inline-flex items-center gap-1.5 font-semibold text-gris underline underline-offset-2">
                <PencilLine className="size-4" /> Escribir la sede a mano
              </button>
            )}
          </div>
        </>
      )}

      {aMano && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Ciudad"><Entrada value={valor.ciudad} onChange={(e) => cambiar({ ...valor, agencia, ciudad: e.target.value })} maxLength={80} /></Campo>
          <Campo etiqueta={agencia === "Otra" ? "Agencia y sede donde recoges" : `Sede de ${agencia} donde recoges`}>
            <Entrada value={valor.sede} onChange={(e) => cambiar({ ...valor, agencia, sede: e.target.value })} maxLength={200} placeholder="Ej. Shalom Av. Grau 520, Barranco" />
          </Campo>
        </div>
      )}

      <p className="text-xs text-gris">
        Tu ubicación solo se usa para esta búsqueda y no la guardamos. Agencias cercanas con datos de © OpenStreetMap, un mapa abierto: puede no tener todas.
      </p>
    </div>
  );
}

// Mapa simple de las agencias encontradas y tu punto (sin servicios externos de mapas).
function Mapa({ lugares, yo, elegida, elegir }: { lugares: Lugar[]; yo: Punto | null; elegida: string; elegir: (s: Lugar) => void }) {
  const pines = lugares.filter((s) => s.lat != null && s.lng != null);
  if (!pines.length) return null;
  const puntos = pines.map((s) => [s.lat!, s.lng!]);
  if (yo) puntos.push([yo.lat, yo.lng]);
  let [la0, la1, lo0, lo1] = [Math.min(...puntos.map((p) => p[0])), Math.max(...puntos.map((p) => p[0])), Math.min(...puntos.map((p) => p[1])), Math.max(...puntos.map((p) => p[1]))];
  const margen = Math.max(0.006, (la1 - la0) * 0.18, (lo1 - lo0) * 0.18);
  la0 -= margen; la1 += margen * 1.8; lo0 -= margen; lo1 += margen;
  const W = 600, H = 260;
  const x = (lo: number) => ((lo - lo0) / (lo1 - lo0)) * W;
  const y = (la: number) => ((la1 - la) / (la1 - la0)) * H;
  const orden = [...pines.filter((s) => textoSede(s) !== elegida), ...pines.filter((s) => textoSede(s) === elegida)];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#efece4] ring-1 ring-linea">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="block h-56 w-full sm:h-64" role="img" aria-label="Mapa de agencias cercanas">
        <path d={`M-20 ${H * 0.62} C ${W * 0.3} ${H * 0.5}, ${W * 0.55} ${H * 0.78}, ${W + 20} ${H * 0.58}`} stroke="#fff" strokeWidth="14" fill="none" />
        <path d={`M${W * 0.28} -20 C ${W * 0.34} ${H * 0.4}, ${W * 0.22} ${H * 0.7}, ${W * 0.3} ${H + 20}`} stroke="#fff" strokeWidth="14" fill="none" />
        <path d={`M-20 ${H * 0.25} L ${W + 20} ${H * 0.32}`} stroke="#fff" strokeWidth="7" fill="none" />
        {yo && (
          <g transform={`translate(${x(yo.lng)},${y(yo.lat)})`}>
            <circle r="16" fill="#2f9cc4" opacity="0.2" />
            <circle r="7" fill="#2f9cc4" stroke="#fff" strokeWidth="2" />
          </g>
        )}
        {orden.map((s, i) => {
          const activa = textoSede(s) === elegida;
          return (
            <g key={`${s.nombre}-${i}`} transform={`translate(${x(s.lng!)},${y(s.lat!)})`} onClick={() => elegir(s)} className="cursor-pointer">
              <title>{s.nombre}</title>
              <path d="M0 0 C-11 -14 -14 -20 -14 -26 A14 14 0 1 1 14 -26 C14 -20 11 -14 0 0Z" fill={activa ? "var(--color-coral)" : "var(--color-pino)"} stroke="#fff" strokeWidth="2" />
              <circle cy="-26" r="5" fill="#fff" />
            </g>
          );
        })}
      </svg>
      {yo && <span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1 text-xs font-bold text-tinta shadow-suave">Tú estás aquí</span>}
    </div>
  );
}
