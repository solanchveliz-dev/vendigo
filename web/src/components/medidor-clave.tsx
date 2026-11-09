import { Check } from "lucide-react";
import { cn } from "@/components/ui";

// Misma regla que la API: 8+ caracteres, mayúscula, minúscula y número.
export const reglasClave = [
  { texto: "8 caracteres o más", ok: (p: string) => p.length >= 8 },
  { texto: "Una mayúscula", ok: (p: string) => /\p{Lu}/u.test(p) },
  { texto: "Una minúscula", ok: (p: string) => /\p{Ll}/u.test(p) },
  { texto: "Un número", ok: (p: string) => /\d/.test(p) },
];

export const claveValida = (p: string) => reglasClave.every((r) => r.ok(p));

export function MedidorClave({ clave }: { clave: string }) {
  if (!clave) return null;
  const cumple = reglasClave.filter((r) => r.ok(clave)).length + (clave.length >= 12 ? 1 : 0);
  const nivel = cumple <= 2 ? { t: "Débil", c: "bg-error", w: "w-1/4" } : cumple <= 4 ? { t: "Aceptable", c: "bg-aviso", w: "w-2/3" } : { t: "Fuerte", c: "bg-ok", w: "w-full" };
  const valida = claveValida(clave);
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-linea">
          <div className={cn("h-full rounded-full transition-all", valida ? nivel.c : "bg-error", valida ? nivel.w : "w-1/4")} />
        </div>
        <span className={cn("text-xs font-semibold", valida ? "text-tinta" : "text-error")}>{valida ? nivel.t : "Débil"}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {reglasClave.map((r) => (
          <li key={r.texto} className={cn("flex items-center gap-1.5 text-xs", r.ok(clave) ? "text-ok" : "text-gris")}>
            <Check className={cn("size-3.5", !r.ok(clave) && "opacity-30")} /> {r.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
