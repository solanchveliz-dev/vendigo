import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "VendiGo", template: "%s · VendiGo" },
  description: "Todas tus tiendas en un solo lugar. Crea tu tienda, recibe pedidos ordenados y cobra con pago protegido.",
  icons: { icon: "/logo.png" },
};

export const viewport: Viewport = { themeColor: "#103b38" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE">
      <body>{children}</body>
    </html>
  );
}
