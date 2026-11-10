import { BadgeCheck, ShieldCheck } from "lucide-react";

// Insignias de confianza de la tienda: identidad verificada (DNI/CE, obligatoria para mostrarse)
// y negocio con RUC verificado (opcional). Las aprueba el equipo de VendiGo.
export function InsigniasTienda({ identidad, ruc, className = "" }: { identidad: boolean; ruc: boolean; className?: string }) {
  if (!identidad && !ruc) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      {identidad && (
        <span title="VendiGo verificó el documento de identidad de la dueña de esta tienda." className="inline-flex items-center gap-1 rounded-full bg-pino-claro px-2.5 py-1 text-xs font-bold text-pino">
          <ShieldCheck className="size-3.5" /> Identidad verificada
        </span>
      )}
      {ruc && (
        <span title="VendiGo verificó el RUC de este negocio con su ficha RUC." className="inline-flex items-center gap-1 rounded-full bg-[#e8eefb] px-2.5 py-1 text-xs font-bold text-[#1f3a7a]">
          <BadgeCheck className="size-3.5" /> Negocio con RUC verificado
        </span>
      )}
    </span>
  );
}
