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
  enviar_cambio_password: "Le envió un cambio de contraseña",
  enviar_mensaje: "Le envió un mensaje",
  aprobar_tienda: "Aprobó una tienda",
  suspender_tienda: "Suspendió una tienda",
  reactivar_tienda: "Reactivó una tienda",
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


export type UsuarioAdmin = {
  id: string;
  nombre: string;
  email: string;
  celular: string;
  rol: "comprador" | "vendedor" | "admin";
  estado: "activo" | "bloqueado" | "pendiente" | "suspendido";
  suspendido_motivo: string;
  ciudad: string;
  creado_en: string;
  ultimo_acceso: string | null;
  pedidos: number;
  tienda_id: string;
  tienda: string;
};

export const ROLES: Record<string, { t: string; clase: string }> = {
  comprador: { t: "Comprador", clase: "text-tinta" },
  vendedor: { t: "Vendedor", clase: "bg-crema text-tinta" },
  admin: { t: "Administrador", clase: "bg-aviso-claro text-aviso" },
};

export const ESTADO_USUARIO: Record<string, { t: string; tono: "neutro" | "error" | "aviso" }> = {
  activo: { t: "Activo", tono: "neutro" },
  pendiente: { t: "Pendiente", tono: "aviso" },
  bloqueado: { t: "Bloqueado", tono: "error" },
  suspendido: { t: "Suspendido", tono: "error" },
};

export const RUBROS: Record<string, string> = {
  moda: "Moda", accesorios: "Accesorios y joyería", belleza: "Belleza", comida: "Alimentos", hogar: "Hogar",
  tecnologia: "Tecnología", artesania: "Artesanías", mascotas: "Mascotas", deportes: "Deportes", otros: "Otros",
};

export type TiendaAdmin = {
  id: string;
  nombre: string;
  slug: string;
  rubro: string;
  lugar: string;
  logo_url: string;
  estado: "activa" | "revision" | "suspendida";
  suspendida_motivo: string;
  productos: number;
  ventas: number;
  reputacion: string;
  usuario_id: string;
  dueno: string;
  creado_en: string;
  revisada_en: string | null;
};

export const ESTADO_TIENDA: Record<string, { t: string; tono: "neutro" | "aviso" | "error" }> = {
  activa: { t: "Activa", tono: "neutro" },
  revision: { t: "En revisión", tono: "aviso" },
  suspendida: { t: "Suspendida", tono: "error" },
};

export const REPUTACION: Record<string, string> = { nueva: "Tienda nueva", buena: "Buena", excelente: "Excelente" };
