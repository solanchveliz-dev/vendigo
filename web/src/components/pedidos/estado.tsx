import { Insignia } from "@/components/ui";

const tonos: Record<string, "aviso" | "pino" | "coral" | "ok" | "error" | "neutro"> = {
  por_aceptar: "coral",
  preparando: "aviso",
  listo_recojo: "aviso",
  enviado: "pino",
  entregado: "ok",
  rechazado: "error",
  cancelado: "error",
};

export function EstadoPedido({ estado, texto }: { estado: string; texto: string }) {
  return <Insignia tono={tonos[estado] ?? "neutro"}>{texto}</Insignia>;
}
