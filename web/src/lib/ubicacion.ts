// Ubicaciones de sedes de agencia: leer coordenadas de un enlace de Google Maps y medir distancias.
// Todo se calcula en el navegador; la ubicación del comprador no se envía al servidor.

export type Punto = { lat: number; lng: number };

const enPeru = (p: Punto) => p.lat >= -18.5 && p.lat <= 0.1 && p.lng >= -81.5 && p.lng <= -68.5;

// Acepta "-12.0931, -77.0465" o un enlace completo de Google Maps (con "@lat,lng", "!3dlat!4dlng" o "q=lat,lng").
// Los enlaces cortos (maps.app.goo.gl) no traen las coordenadas: hay que abrirlos y copiar el enlace largo.
export function leerUbicacion(texto: string): Punto | null {
  const t = decodeURIComponent(texto.trim());
  const patrones = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // el punto exacto del lugar
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, // el centro del mapa
    /[?&](?:q|query|ll|destination)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];
  for (const re of patrones) {
    const m = t.match(re);
    if (m) {
      const p = { lat: Number(m[1]), lng: Number(m[2]) };
      if (enPeru(p)) return p;
    }
  }
  return null;
}

export function esEnlaceCorto(texto: string) {
  return /maps\.app\.goo\.gl|goo\.gl\/maps/.test(texto);
}

// Distancia en línea recta (fórmula de Haversine), en km.
export function distanciaKm(a: Punto, b: Punto) {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export const textoKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);
