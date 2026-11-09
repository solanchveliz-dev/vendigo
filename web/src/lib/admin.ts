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
  retirar_producto: "Retiró una publicación",
  restaurar_producto: "Habilitó una publicación",
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

export type ProductoAdmin = {
  id: string;
  nombre: string;
  categoria: string;
  precio_centimos: number;
  stock: number;
  estado: "publicado" | "agotado" | "pausado" | "retirado";
  retirado_motivo: string;
  oferta_pct: number;
  imagen_url: string;
  tienda_id: string;
  tienda: string;
  slug: string;
  rubro: string;
  creado_en: string;
};

type Tono = "ok" | "aviso" | "error" | "neutro";

export const ESTADO_PRODUCTO: Record<ProductoAdmin["estado"], { t: string; tono: Tono }> = {
  publicado: { t: "Publicado", tono: "ok" },
  agotado: { t: "Agotado", tono: "error" },
  pausado: { t: "Pausado", tono: "neutro" },
  retirado: { t: "Retirado", tono: "error" },
};

export type PedidoAdmin = {
  id: string;
  codigo: string;
  tienda_id: string;
  tienda: string;
  comprador: string;
  entrega: "agencia" | "motorizado" | "recojo";
  agencia: string;
  estado: string;
  pago_estado: string;
  metodo_pago: string;
  total_centimos: number;
  reclamo: string | null;
  creado_en: string;
};

export const ENTREGA: Record<string, string> = { agencia: "Agencia", motorizado: "Motorizado", recojo: "Recojo" };
export const METODO_PAGO: Record<string, string> = { yape: "Yape", tarjeta: "Tarjeta", pagoefectivo: "PagoEfectivo", al_recibir: "Paga al recibir" };

// Estado del pedido como lo lee el admin (una sola etiqueta por fila).
export function estadoPedidoAdmin(p: Pick<PedidoAdmin, "estado" | "entrega" | "agencia" | "pago_estado" | "reclamo">): { t: string; tono: Tono; grupo: string } {
  if (p.reclamo === "abierto" || p.reclamo === "en_revision") return { t: "Con reclamo", tono: "error", grupo: "reclamo" };
  switch (p.estado) {
    case "por_aceptar":
      return { t: "Por aceptar", tono: "aviso", grupo: "por_aceptar" };
    case "preparando":
      return { t: "En preparación", tono: "neutro", grupo: "preparando" };
    case "listo_recojo":
      return { t: "Listo para recoger", tono: "aviso", grupo: "preparando" };
    case "enviado":
      return p.entrega === "agencia"
        ? { t: `Enviado por ${p.agencia || "agencia"}`, tono: "ok", grupo: "en_camino" }
        : { t: p.pago_estado === "pendiente" ? "En camino · paga al recibir" : "En camino", tono: "ok", grupo: "en_camino" };
    case "entregado":
      return { t: "Entregado y pagado", tono: "ok", grupo: "entregado" };
    case "rechazado":
      return { t: "Rechazado por la tienda", tono: "neutro", grupo: "cancelado" };
    default:
      return { t: p.entrega === "recojo" ? "Reserva cancelada" : "Cancelado", tono: "neutro", grupo: "cancelado" };
  }
}

export const GRUPOS_PEDIDO: Record<string, string> = {
  por_aceptar: "Por aceptar",
  preparando: "En preparación",
  en_camino: "En camino",
  entregado: "Entregados",
  cancelado: "Cancelados",
  reclamo: "Con reclamo",
};
