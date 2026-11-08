// Arma los enlaces a las redes de una tienda sin importar cómo las escribió el vendedor:
// "@lunaysol", "lunaysol" o "https://www.instagram.com/lunaysol/" terminan en el mismo enlace.

export type Red = "instagram" | "tiktok" | "facebook";

const dominios: Record<Red, RegExp> = {
  instagram: /instagram\.com\/([^/?#]+)/i,
  tiktok: /tiktok\.com\/@?([^/?#]+)/i,
  facebook: /(?:facebook|fb)\.com\/([^#]+)/i,
};

const base: Record<Red, string> = {
  instagram: "https://www.instagram.com/",
  tiktok: "https://www.tiktok.com/@",
  facebook: "https://www.facebook.com/",
};

// Devuelve solo el usuario (sin @ ni enlace) o "" si no es válido.
export function usuarioRed(red: Red, valor: string | null | undefined) {
  let v = (valor ?? "").trim();
  if (!v) return "";
  const m = v.match(dominios[red]);
  if (m) v = m[1];
  v = v.replace(/^@+/, "").replace(/\/+$/, "");
  return /^[\w.\-/?=&]{2,80}$/.test(v) ? v : "";
}

export function enlaceRed(red: Red, valor: string | null | undefined) {
  const u = usuarioRed(red, valor);
  return u ? base[red] + u : "";
}
