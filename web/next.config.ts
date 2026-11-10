import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Genera un servidor autocontenido para la imagen de Docker (no cambia nada en local con npm run dev).
  output: "standalone",
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
