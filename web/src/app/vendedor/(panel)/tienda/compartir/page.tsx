"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Info, Link2, Printer, Share2, ShieldCheck } from "lucide-react";
import { useApi } from "@/lib/api";
import type { Tienda } from "@/lib/tipos";
import { Boton, Cargando, useAvisar } from "@/components/ui";

// "Comparte tu tienda" igual que en el prototipo: enlace, redes y QR real.
export default function Compartir() {
  const { datos: t } = useApi<Tienda>("/vendedor/tienda");
  const avisar = useAvisar();
  const [qr, setQr] = useState("");

  useEffect(() => {
    if (t?.identidad_verificada) QRCode.toDataURL(t.enlace, { margin: 1, width: 640, color: { dark: "#1c2b3a" } }).then(setQr);
  }, [t]);
  if (!t) return <Cargando />;
  // Sin DNI aprobado la tienda no existe para los compradores: compartir el enlace solo llevaría a una página vacía.
  if (!t.identidad_verificada) {
    return (
      <div className="mx-auto max-w-xl rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
        <span className="grid size-11 place-items-center rounded-xl bg-aviso-claro text-aviso"><ShieldCheck className="size-5" /></span>
        <h1 className="mt-3 text-2xl font-extrabold text-pino">Todavía no puedes compartir tu tienda</h1>
        <p className="mt-1 text-sm text-gris">
          Tus clientes podrán verla cuando VendiGo apruebe tu DNI. Si ya lo enviaste, lo estamos revisando; te avisaremos por SMS.
          Mientras tanto puedes ver cómo quedará con la vista previa.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/vendedor/verificacion"><Boton>Ver mi verificación</Boton></Link>
          <Link href="/vendedor/tienda/vista"><Boton variante="secundario">Vista previa</Boton></Link>
        </div>
      </div>
    );
  }
  const tienda = t;
  const corto = tienda.enlace.replace(/^https?:\/\//, "");

  async function copiar() {
    await navigator.clipboard.writeText(tienda.enlace);
    avisar("Enlace copiado");
  }

  async function compartirEn(red: string) {
    const texto = `Mira mi tienda ${tienda.nombre} en VendiGo y paga seguro 🛍️`;
    if (red === "WhatsApp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${texto} ${tienda.enlace}`)}`, "_blank", "noopener");
    } else if (red === "Facebook") {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tienda.enlace)}`, "_blank", "noopener");
    } else {
      // Instagram no permite compartir enlaces desde la web: lo copiamos para tu bio o historia.
      if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
        navigator.share({ title: tienda.nombre, text: texto, url: tienda.enlace }).catch(() => {});
        return;
      }
      await navigator.clipboard.writeText(tienda.enlace);
      avisar("Enlace copiado. Pégalo en tu bio o en una historia de Instagram");
      window.open("https://www.instagram.com/", "_blank", "noopener");
    }
  }

  // QR listo para imprimir: código + nombre de la tienda + enlace.
  async function tarjetaQR() {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 980;
    const x = c.getContext("2d")!;
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, c.width, c.height);
    const img = new Image();
    img.src = qr;
    await img.decode();
    x.drawImage(img, 80, 80, 640, 640);
    x.fillStyle = "#103b38";
    x.textAlign = "center";
    x.font = "800 48px system-ui, sans-serif";
    x.fillText(tienda.nombre, 400, 810);
    x.fillStyle = "#6b7280";
    x.font = "500 30px system-ui, sans-serif";
    x.fillText(corto, 400, 865);
    x.fillStyle = "#f26b4f";
    x.font = "700 26px system-ui, sans-serif";
    x.fillText("Escanea y compra seguro con VendiGo", 400, 920);
    return c.toDataURL("image/png");
  }

  async function descargar() {
    const a = document.createElement("a");
    a.href = await tarjetaQR();
    a.download = `qr-${tienda.slug}.png`;
    a.click();
    avisar("QR descargado");
  }

  async function imprimir() {
    const src = await tarjetaQR();
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<title>QR ${tienda.nombre}</title><body style="margin:0;display:grid;place-items:center;min-height:100vh"><img src="${src}" style="width:320px" onload="window.print()"></body>`);
    w.document.close();
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Comparte tu tienda</h1>
        <p className="mt-1 text-sm text-gris">Pega el enlace en tu bio o imprime el QR para tu local, empaques o ferias.</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <h3 className="text-lg font-extrabold text-tinta">Enlace de tu tienda</h3>
          <div className="mt-4 flex items-center rounded-2xl bg-white ring-1 ring-linea">
            <span className="grid h-12 w-11 shrink-0 place-items-center border-r border-linea text-gris"><Link2 className="size-4" /></span>
            <input readOnly value={tienda.enlace} aria-label="Enlace" onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" />
            <button onClick={copiar} className="m-1 shrink-0 rounded-full bg-pino px-4 py-2 text-sm font-bold text-white hover:bg-pino/90">Copiar enlace</button>
          </div>

          <h4 className="mt-6 font-bold text-tinta">Compartir en</h4>
          <div className="mt-3 flex flex-wrap gap-3">
            {["WhatsApp", "Instagram", "Facebook"].map((n) => (
              <button key={n} onClick={() => compartirEn(n)} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-tinta ring-1 ring-linea hover:bg-crema">
                <Share2 className="size-4" /> {n}
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-arena px-4 py-3 text-sm text-tinta">
            <Info className="size-4 shrink-0" />
            <span>Consejo: pon el enlace en tus redes, y el QR en tus bolsas o tarjetas.</span>
          </div>
        </section>

        <section className="flex flex-col items-center rounded-[22px] bg-white p-6 text-center shadow-suave ring-1 ring-linea/60">
          <h3 className="text-lg font-extrabold text-tinta">Código QR</h3>
          <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-linea">
            {qr ? <img src={qr} alt="Código QR de tu tienda" className="size-56" /> : <div className="size-56" />}
          </div>
          <p className="mt-4 text-sm text-gris">{tienda.nombre} · {corto}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Boton variante="acento" onClick={descargar} disabled={!qr}><Download className="size-4" /> Descargar QR</Boton>
            <Boton variante="secundario" onClick={imprimir} disabled={!qr}><Printer className="size-4" /> Imprimir</Boton>
          </div>
          <p className="mt-4 text-xs text-gris">Al escanearlo, tus clientes llegan directo a tu tienda.</p>
        </section>
      </div>
    </div>
  );
}
