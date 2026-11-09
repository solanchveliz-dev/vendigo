export type Vendedora = {
  id: string;
  nombre: string;
  celular: string;
  email: string;
  activo: boolean;
  suspendido_motivo: string;
  bloqueada: boolean;
  creado_en: string;
  tienda_id: string;
  tienda: string;
  slug: string;
  plan: string;
  verificacion: string;
  pedidos: number;
  ventas_centimos: number;
  ultimo_acceso: string | null;
  reputacion: string;
};

export type Evento = { id: number; usuario: string; rol: string; accion: string; entidad: string; entidad_id: string; datos: string; creado_en: string };

export const ACCIONES: Record<string, string> = {
  suspender_cuenta: "Suspendió una cuenta",
  reactivar_cuenta: "Reactivó una cuenta",
  aprobar_identidad: "Aprobó una identidad",
  rechazar_identidad: "Rechazó una identidad",
  ver_documento: "Vio un documento de identidad",
  retiro_pagado: "Registró una transferencia",
  retiro_rechazado: "Rechazó un retiro",
  resolver_reclamo: "Resolvió un reclamo",
  crear_admin: "Se creó una cuenta admin",
  activar_mfa: "Activó la verificación en dos pasos",
  desactivar_mfa: "Desactivó la verificación en dos pasos",
  cuenta_bancaria: "Cambió su cuenta bancaria",
  usar_codigo_respaldo: "Entró con un código de respaldo",
  reiniciar_mfa: "Se reinició su verificación en dos pasos",
  cambiar_inactividad: "Cambió el cierre de sesiones inactivas",
  cambiar_password: "Cambió su contraseña",
  recuperar_password: "Recuperó su contraseña",
  retiro: "Pidió un retiro",
  devolver_reclamo: "Devolvió el dinero de un reclamo",
  responder_reclamo: "Respondió un reclamo",
};

export const VERIFICACION: Record<string, { texto: string; tono: "ok" | "aviso" | "error" | "neutro" }> = {
  aprobada: { texto: "Verificada", tono: "ok" },
  pendiente: { texto: "Por revisar", tono: "aviso" },
  rechazada: { texto: "Rechazada", tono: "error" },
  sin_enviar: { texto: "Sin enviar", tono: "neutro" },
};

export function fechaHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function fecha(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function estadoVendedora(v: Vendedora) {
  if (!v.activo) return { clave: "suspendidas", t: "Suspendido", tono: "error" as const };
  if (v.verificacion === "pendiente") return { clave: "pendientes", t: "Pendiente", tono: "aviso" as const };
  if (v.bloqueada) return { clave: "activas", t: "Bloqueo temporal", tono: "aviso" as const };
  return { clave: "activas", t: "Activo", tono: "neutro" as const };
}

