"use client";

import { api } from "./api";

type Subida = { key: string; url_subida: string; url_publica?: string };
export type TipoArchivo = "producto" | "logo" | "portada" | "historia" | "pago_qr" | "devolucion" | "boleta" | "dni" | "reclamo";

// Reduce la foto en el navegador antes de subirla (más rápido y gasta menos datos).
async function reducir(archivo: File, maximo = 1600): Promise<Blob> {
  if (!archivo.type.startsWith("image/")) return archivo;
  const bitmap = await createImageBitmap(archivo).catch(() => null);
  if (!bitmap) return archivo;
  const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && archivo.size < 900_000) return archivo;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok) => canvas.toBlob((b) => ok(b ?? archivo), "image/jpeg", 0.85));
}

// subirImagen pide una URL firmada a la API y sube la foto directo a S3.
// `ruta` cambia el endpoint que firma la subida (por ejemplo, el de recuperar la cuenta, que no tiene sesión).
export async function subirImagen(archivo: File, tipo: TipoArchivo | "frente" | "selfie", ruta = "/vendedor/archivos") {
  const blob = await reducir(archivo);
  const contentType = blob.type || "image/jpeg";
  const s = await api.post<Subida>(ruta, { tipo, content_type: contentType, tamano: blob.size });
  const r = await fetch(s.url_subida, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
  if (!r.ok) throw new Error("No se pudo subir la imagen. Revisa tu conexión e inténtalo de nuevo.");
  return { key: s.key, url: s.url_publica ?? URL.createObjectURL(blob) };
}
