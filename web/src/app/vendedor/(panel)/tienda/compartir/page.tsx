"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Copy, Download, Sparkles } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import type { Producto, Tienda } from "@/lib/tipos";
import { Boton, Campo, Cargando, Encabezado, Area, Selector, Tarjeta, useAvisar } from "@/components/ui";

export default function Compartir() {
  const { datos: t } = useApi<Tienda>("/vendedor/tienda");
  const prods = useApi<{ productos: Producto[] }>("/vendedor/productos?filtro=activos");
  const avisar = useAvisar();
  const [qr, setQr] = useState("");
  const [producto, setProducto] = useState("");
  const [red, setRed] = useState("instagram");
  const [post, setPost] = useState("");
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    if (t) QRCode.toDataURL(t.enlace, { margin: 1, width: 480, color: { dark: "#103b38" } }).then(setQr);
  }, [t]);
  useEffect(() => {
    if (!producto && prods.datos?.productos[0]) setProducto(prods.datos.productos[0].id);
  }, [prods.datos, producto]);
  if (!t) return <Cargando />;

  async function copiar(texto: string, msg: string) {
    await navigator.clipboard.writeText(texto);
    avisar(msg);
  }

  async function crearPost() {
    setCreando(true);
    try {
      const r = await api.post<{ texto: string }>("/vendedor/ia/crear-post", { producto_id: producto, red });
      setPost(r.texto);
    } catch (e) {
      avisar((e as ErrorApi).message, "error");
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/vendedor/tienda" className="inline-flex items-center gap-1 text-sm font-semibold text-pino">
        <ArrowLeft className="size-4" /> Mi tienda
      </Link>
      <Encabezado titulo="Compartir tienda" detalle="Ponlo en tu biografía, en tus lives o en tus estados de WhatsApp." />
      <div className="grid gap-5 md:grid-cols-[1fr_220px]">
        <Tarjeta className="space-y-3">
          <p className="text-sm text-gris">Tu enlace</p>
          <p className="break-all font-display text-xl font-extrabold text-pino">{t.enlace}</p>
          <div className="flex flex-wrap gap-2">
            <Boton onClick={() => copiar(t.enlace, "Enlace copiado")}>
              <Copy className="size-4" /> Copiar enlace
            </Boton>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Mira mi tienda en VendiGo: ${t.enlace}`)}`} target="_blank" rel="noreferrer">
              <Boton variante="secundario">Enviar por WhatsApp</Boton>
            </a>
          </div>
        </Tarjeta>
        <Tarjeta className="flex flex-col items-center gap-3">
          {qr && <img src={qr} alt="Código QR de tu tienda" className="size-40" />}
          <a href={qr} download={`qr-${t.slug}.png`}>
            <Boton variante="secundario" tamano="sm">
              <Download className="size-4" /> Descargar QR
            </Boton>
          </a>
        </Tarjeta>
      </div>

      <Tarjeta className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 font-extrabold text-pino">
            <Sparkles className="size-5 text-coral" /> Post para redes
          </h2>
          <p className="text-sm text-gris">La IA escribe el texto de tu publicación. Tú eliges la foto y lo publicas. 1 crédito.</p>
        </div>
        {prods.datos?.productos.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <Campo etiqueta="Producto">
                <Selector value={producto} onChange={(e) => setProducto(e.target.value)}>
                  {prods.datos.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Selector>
              </Campo>
              <Campo etiqueta="Red social">
                <Selector value={red} onChange={(e) => setRed(e.target.value)}>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="facebook">Facebook</option>
                </Selector>
              </Campo>
            </div>
            <Boton variante="acento" cargando={creando} onClick={crearPost}>
              <Sparkles className="size-4" /> Crear post
            </Boton>
            {post && (
              <div className="space-y-2">
                <Area value={post} onChange={(e) => setPost(e.target.value)} rows={6} />
                <Boton variante="secundario" onClick={() => copiar(post, "Texto copiado")}>
                  <Copy className="size-4" /> Copiar texto
                </Boton>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-gris">Publica un producto para crear posts.</p>
        )}
      </Tarjeta>
    </div>
  );
}
