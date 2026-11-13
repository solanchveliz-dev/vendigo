"use client";

import { useEffect, useMemo, useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { Campo, Entrada, cn } from "@/components/ui";
import { distanciaKm, textoKm, type Punto } from "@/lib/ubicacion";

type Sede = { agencia: string; ciudad: string; nombre: string; direccion: string; lat: number | null; lng: number | null; de_ejemplo?: boolean };
export type EleccionSede = { agencia: string; ciudad: string; sede: string };

// Sin tildes ni mayúsculas, para que "jesus maria" encuentre "Jesús María".
const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const textoSede = (s: Sede) => `${s.nombre} · ${s.direccion}`.slice(0, 200);

// Elegir dónde recoger el envío por agencia, como en el prototipo: la agencia, "la más cercana a mí",
// buscar por distrito, el mapa y la lista ordenada por distancia.
// La ubicación del comprador se usa solo en su navegador para medir distancias: no se envía a VendiGo.
// Si el admin aún no cargó sedes de esa agencia, se escribe la sede a mano como antes.
export function ElegirSede({ agencias, valor, cambiar }: { agencias: string[]; valor: EleccionSede; cambiar: (v: EleccionSede) => void }) {
  const agencia = valor.agencia || agencias[0] || "";
  const [sedes, setSedes] = useState<Sede[] | null>(null);
  const [q, setQ] = useState("");
  const [yo, setYo] = useState<Punto | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState("");
  const [todas, setTodas] = useState(false);

  // La primera agencia queda elegida sola si la tienda trabaja con una sola.
  useEffect(() => {
    if (!valor.agencia && agencia) cambiar({ agencia, ciudad: "", sede: "" });
  }, [valor.agencia, agencia, cambiar]);

  useEffect(() => {
    if (!agencia) return;
    // "Otra" agencia no tiene sedes cargadas: se escribe a mano.
    if (agencia === "Otra") return setSedes([]);
    setSedes(null);
    fetch(`/api/v1/agencias/sedes?agencia=${encodeURIComponent(agencia)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { sedes: [] }))
      .then((d: { sedes: Sede[] }) => setSedes(d.sedes ?? []))
      .catch(() => setSedes([]));
  }, [agencia]);

  const lista = useMemo(() => {
    const palabras = plano(q).split(/\s+/).filter(Boolean);
    return (sedes ?? [])
      .filter((s) => palabras.every((w) => plano(`${s.ciudad} ${s.nombre} ${s.direccion}`).includes(w)))
      .map((s) => ({ ...s, km: yo && s.lat != null && s.lng != null ? distanciaKm(yo, { lat: s.lat, lng: s.lng }) : null }))
      .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  }, [sedes, q, yo]);

  const cercana = yo && lista[0]?.km != null && lista[0].km < 60 ? lista[0] : null;
  const conUbicacion = (sedes ?? []).some((s) => s.lat != null && s.lng != null);
  // Ya se conoce la ubicación del comprador pero ninguna sede queda a menos de 60 km.
  const lejos = !!yo && conUbicacion && !q && !cercana;

  function elegir(s: Sede) {
    cambiar({ agencia, ciudad: s.ciudad, sede: textoSede(s) });
  }

  function ubicarme() {
    setErrorUbicacion("");
    // Sin sedes ubicadas en el mapa no hay con qué medir: se avisa en vez de no hacer nada.
    if (!conUbicacion) return setErrorUbicacion(`Las sedes de ${agencia} todavía no tienen su ubicación en el mapa. Por ahora escribe tu distrito o ciudad y elige de la lista.`);
    if (!window.isSecureContext) return setErrorUbicacion("La ubicación solo funciona en páginas seguras (https o localhost). Abre VendiGo con tu enlace https o escribe tu distrito.");
    if (!navigator.geolocation) return setErrorUbicacion("Tu navegador no permite usar tu ubicación. Escribe tu distrito o ciudad.");
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUbicando(false);
        setQ("");
        setYo({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      (e) => {
        setUbicando(false);
        // Cada causa con su propio mensaje, para saber qué revisar.
        setErrorUbicacion(
          e.code === e.PERMISSION_DENIED
            ? "Bloqueaste el permiso de ubicación. Actívalo en el ícono a la izquierda de la dirección del navegador (y en tu Mac: Ajustes → Privacidad y seguridad → Localización → Chrome) o escribe tu distrito."
            : e.code === e.TIMEOUT
              ? "Tu equipo tardó demasiado en encontrar tu ubicación. Vuelve a intentarlo o escribe tu distrito o ciudad."
              : "Tu equipo no pudo saber dónde estás (pasa en computadoras sin Wi-Fi). Escribe tu distrito o ciudad.",
        );
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }

  // Al encontrar la más cercana, queda elegida (se puede cambiar tocando otra).
  useEffect(() => {
    if (cercana) cambiar({ agencia, ciudad: cercana.ciudad, sede: textoSede(cercana) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yo]);

  const sinSedes = sedes !== null && sedes.length === 0;
  const visibles = todas ? lista : lista.slice(0, yo ? 5 : 8);

  return (
    <div className="space-y-3 sm:col-span-2">
      {agencias.length > 1 && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Agencia">
          {agencias.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={a === agencia}
              onClick={() => { setTodas(false); cambiar({ agencia: a, ciudad: "", sede: "" }); }}
              className={cn("rounded-full px-4 py-2 text-sm font-bold transition", a === agencia ? "bg-pino text-white" : "bg-white text-tinta ring-1 ring-linea hover:bg-arena/60")}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      {!agencia ? (
        <p className="text-sm text-gris">Esta tienda aún no indica con qué agencias envía. Escríbele antes de pedir.</p>
      ) : sedes === null ? (
        <p className="text-sm text-gris">Cargando sedes de {agencia}…</p>
      ) : sinSedes ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Ciudad"><Entrada value={valor.ciudad} onChange={(e) => cambiar({ ...valor, agencia, ciudad: e.target.value })} maxLength={80} /></Campo>
          <Campo etiqueta={agencia === "Otra" ? "Agencia y sede donde recoges" : `Sede de ${agencia} donde recoges`}><Entrada value={valor.sede} onChange={(e) => cambiar({ ...valor, agencia, sede: e.target.value })} maxLength={200} placeholder="Ej. Av. Grau 520" /></Campo>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={ubicarme}
            disabled={ubicando}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-coral px-5 text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-70"
          >
            <LocateFixed className="size-4" /> {ubicando ? "Buscando tu ubicación…" : `Buscar la ${agencia} más cercana a mí`}
          </button>
          {errorUbicacion && <p className="text-sm text-error">{errorUbicacion}</p>}
          {lejos && <p className="text-sm text-aviso">No hay sedes de {agencia} a menos de 60 km de ti. Revisa la lista o escribe tu ciudad.</p>}
          <label className="flex h-11 items-center gap-2 rounded-full bg-white px-4 ring-1 ring-linea focus-within:ring-2 focus-within:ring-pino">
            <Search className="size-4 shrink-0 text-gris" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="O escribe tu distrito o ciudad" aria-label="Buscar sede por distrito o ciudad" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>

          <Mapa sedes={lista} yo={yo} elegida={valor.sede} elegir={elegir} />

          {lista.length === 0 ? (
            <p className="text-sm text-gris">No hay sedes de {agencia} con “{q}”. Prueba con otro distrito o ciudad.</p>
          ) : (
            <ul className="space-y-2" role="radiogroup" aria-label={`Sedes de ${agencia}`}>
              {visibles.map((s) => {
                const activa = valor.sede === textoSede(s);
                return (
                  <li key={s.nombre}>
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
                        <span className="block truncate text-xs text-gris">{s.direccion}, {s.ciudad}</span>
                      </span>
                      {cercana?.nombre === s.nombre && <span className="shrink-0 rounded-full bg-coral px-2 py-0.5 text-[11px] font-bold text-white">Más cerca</span>}
                      {s.km != null && <span className="shrink-0 text-sm font-bold text-tinta">{textoKm(s.km)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {lista.length > visibles.length && (
            <button type="button" onClick={() => setTodas(true)} className="text-sm font-bold text-pino underline underline-offset-2">
              Ver las {lista.length} sedes
            </button>
          )}
          {lista.some((s) => s.de_ejemplo) && (
            <p className="rounded-xl bg-aviso-claro px-3 py-2 text-xs font-semibold text-aviso">
              Algunas sedes son de ejemplo para la demostración. Confirma la dirección en la app de {agencia} antes de ir.
            </p>
          )}
          <p className="text-xs text-gris">Tu ubicación solo se usa en tu celular para medir la distancia. No la guardamos. Mapa de sedes con datos de © OpenStreetMap.</p>
        </>
      )}
    </div>
  );
}

// Mapa simple de las sedes (sin servicios externos): los puntos se ubican según su latitud y longitud.
// Muestra la ciudad de la sede elegida o de la primera de la lista, para que no se aplasten Lima y Arequipa juntas.
function Mapa({ sedes, yo, elegida, elegir }: { sedes: (Sede & { km: number | null })[]; yo: Punto | null; elegida: string; elegir: (s: Sede) => void }) {
  const actual = sedes.find((s) => textoSede(s) === elegida) ?? sedes[0];
  const pines = sedes.filter((s) => s.lat != null && s.lng != null && s.ciudad === actual?.ciudad);
  if (!pines.length) return null;
  const puntos = pines.map((s) => [s.lat!, s.lng!]);
  const yoCerca = yo && pines.some((s) => distanciaKm(yo, { lat: s.lat!, lng: s.lng! }) < 60);
  if (yo && yoCerca) puntos.push([yo.lat, yo.lng]);
  let [la0, la1, lo0, lo1] = [Math.min(...puntos.map((p) => p[0])), Math.max(...puntos.map((p) => p[0])), Math.min(...puntos.map((p) => p[1])), Math.max(...puntos.map((p) => p[1]))];
  const margen = Math.max(0.012, (la1 - la0) * 0.18, (lo1 - lo0) * 0.18);
  la0 -= margen; la1 += margen * 1.8; lo0 -= margen; lo1 += margen;
  const W = 600, H = 260;
  const x = (lo: number) => ((lo - lo0) / (lo1 - lo0)) * W;
  const y = (la: number) => ((la1 - la) / (la1 - la0)) * H;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#efece4] ring-1 ring-linea">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="block h-56 w-full sm:h-64" role="img" aria-label={`Mapa de sedes en ${actual?.ciudad}`}>
        <path d={`M-20 ${H * 0.62} C ${W * 0.3} ${H * 0.5}, ${W * 0.55} ${H * 0.78}, ${W + 20} ${H * 0.58}`} stroke="#fff" strokeWidth="14" fill="none" />
        <path d={`M${W * 0.28} -20 C ${W * 0.34} ${H * 0.4}, ${W * 0.22} ${H * 0.7}, ${W * 0.3} ${H + 20}`} stroke="#fff" strokeWidth="14" fill="none" />
        <path d={`M-20 ${H * 0.25} L ${W + 20} ${H * 0.32}`} stroke="#fff" strokeWidth="7" fill="none" />
        <path d={`M${W * 0.7} -20 L ${W * 0.62} ${H + 20}`} stroke="#fff" strokeWidth="7" fill="none" />
        {yo && yoCerca && (
          <g transform={`translate(${x(yo.lng)},${y(yo.lat)})`}>
            <circle r="16" fill="#2f9cc4" opacity="0.2" />
            <circle r="7" fill="#2f9cc4" stroke="#fff" strokeWidth="2" />
          </g>
        )}
        {[...pines.filter((s) => textoSede(s) !== elegida), ...pines.filter((s) => textoSede(s) === elegida)].map((s) => {
          const activa = textoSede(s) === elegida;
          return (
            <g key={s.nombre} transform={`translate(${x(s.lng!)},${y(s.lat!)})`} onClick={() => elegir(s)} className="cursor-pointer">
              <title>{s.nombre}</title>
              <path d="M0 0 C-11 -14 -14 -20 -14 -26 A14 14 0 1 1 14 -26 C14 -20 11 -14 0 0Z" fill={activa ? "var(--color-coral)" : "var(--color-pino)"} stroke="#fff" strokeWidth="2" />
              <circle cy="-26" r="5" fill="#fff" />
            </g>
          );
        })}
      </svg>
      <span className="absolute bottom-3 left-3 rounded-full bg-white px-3 py-1 text-xs font-bold text-tinta shadow-suave">{actual?.ciudad}</span>
    </div>
  );
}
