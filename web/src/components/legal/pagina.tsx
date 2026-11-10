import { CabeceraPublica } from "@/components/tienda/cabecera";
import { PieLegal } from "@/components/legal/pie";

export const ACTUALIZADO = "10 de noviembre de 2026";

// Plantilla de las páginas legales: título, fecha de actualización y secciones numeradas.
export function PaginaLegal({ titulo, intro, secciones }: { titulo: string; intro: React.ReactNode; secciones: [string, React.ReactNode][] }) {
  return (
    <div className="min-h-screen bg-crema">
      <CabeceraPublica />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-10 sm:px-8">
        <div className="mb-3 h-1 w-10 rounded-full bg-coral" />
        <h1 className="text-4xl font-extrabold text-pino">{titulo}</h1>
        <p className="mt-2 text-sm text-gris">Última actualización: {ACTUALIZADO}</p>
        <div className="mt-6 text-[15px] leading-relaxed text-tinta/90">{intro}</div>
        <div className="mt-8 space-y-7">
          {secciones.map(([t, c], i) => (
            <section key={t}>
              <h2 className="text-xl font-extrabold text-tinta">{i + 1}. {t}</h2>
              <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-tinta/90 [&_li]:ml-5 [&_li]:list-disc">{c}</div>
            </section>
          ))}
        </div>
        <PieLegal className="mt-14 border-t border-linea pt-6" />
      </main>
    </div>
  );
}
