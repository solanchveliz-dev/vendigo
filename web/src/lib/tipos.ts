export type Usuario = { id: string; nombre: string; celular: string; email: string | null; rol: string; tienda_id: string | null };

export type Entrega = {
  recojo: boolean;
  direccion_recojo: string;
  horario_recojo: string;
  agencia: boolean;
  agencias: string[];
  motorizado: boolean;
  costo_motorizado_centimos: number;
  zonas_motorizado: string;
  instrucciones_recojo: string;
  dias_recojo: number[];
  adelanto_pct: number;
  costo_agencia_centimos: number;
  otra: boolean;
  descripcion_otra: string;
};

export type Tienda = {
  id: string;
  nombre: string;
  slug: string;
  rubro: string;
  descripcion: string;
  ciudad: string;
  distrito: string;
  logo_key: string | null;
  logo_url: string;
  portada_key: string | null;
  portada_url: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  whatsapp: string;
  correo: string;
  horario: string;
  politicas: string;
  entrega: Entrega;
  reputacion: "nueva" | "buena" | "excelente";
  dias_liberacion: number;
  enlace: string;
  pausada: boolean;
  tema_color: string;
  tema_fuente: string;
  prefijo_pedido: string;
  destacado_id: string | null;
  aviso: string;
  historia: string;
  historia_foto_key: string | null;
  historia_foto_url: string;
  vende_desde: number | null;
};

export type Variante = { id?: string; nombre: string; stock: number; precio_centimos: number | null };
export type Producto = {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  precio_centimos: number;
  stock: number;
  activo: boolean;
  variantes: Variante[];
  imagenes: { key: string; url: string }[];
  oferta: { descuento_pct: number; termina_en: string; precio_final_centimos: number } | null;
  vendidos: number;
  creado_en: string;
  detalles?: Record<string, unknown>;
};

export type PedidoResumen = {
  id: string;
  codigo: string;
  comprador: string;
  entrega: "recojo" | "agencia" | "motorizado";
  estado: string;
  estado_texto: string;
  metodo_pago: string;
  pago_estado: string;
  total_centimos: number;
  items: number;
  producto: string;
  imagen_url: string;
  liberar_en: string | null;
  liberado: boolean;
  reclamo: string | null;
  creado_en: string;
};

export type Reclamo = {
  id: string;
  motivo: string;
  motivo_texto: string;
  descripcion: string;
  fotos: string[];
  estado: string;
  respuesta_vendedor: string | null;
  evidencias: string[];
  respondido_en: string | null;
  creado_en: string;
};

export type PedidoDetalle = PedidoResumen & {
  comprador_celular: string;
  comprador_dni: string;
  direccion: string;
  distrito: string;
  ciudad: string;
  referencia: string;
  agencia: string;
  agencia_sede: string;
  nota_comprador: string;
  subtotal_centimos: number;
  envio_centimos: number;
  comision_pasarela_centimos: number;
  neto_centimos: number;
  motivo_cancelacion: string;
  confirmado_por: string | null;
  items_detalle: { nombre: string; variante: string; imagen_url: string; precio_centimos: number; cantidad: number }[];
  envio: {
    agencia: string;
    numero_orden: string;
    clave_recojo: string;
    boleta_url: string;
    nota: string;
    registrado_en: string;
    motorizado_nombre: string;
    motorizado_celular: string;
  } | null;
  eventos: { estado: string; detalle: string; fecha: string }[];
  reclamo_detalle: Reclamo | null;
  acciones: string[];
  aceptado_en: string | null;
  enviado_en: string | null;
  entregado_en: string | null;
  pedidos_cliente: number;
  motorizados_guardados: { nombre: string; celular: string }[];
  ayuda: Ayuda | null;
};

export type Ayuda = {
  id: string;
  pedido_id: string;
  codigo: string;
  comprador: string;
  motivo: string;
  abierta: boolean;
  mensajes: { autor: "cliente" | "tienda"; texto: string; creado_en: string }[];
  creado_en: string;
};

export type Saldos = { a_liberar_centimos: number; disponible_centimos: number; retirado_centimos: number };

export type Plan = { id: string; nombre: string; precio_centimos: number; ventas_mes: number | null; creditos_ia: number; productos_max: number | null };
export type UsoPlan = {
  plan: Plan;
  mes_gratis: boolean;
  desde: string;
  proximo_cobro: string | null;
  ventas_usadas: number;
  ventas_extra: number;
  ventas_limite: number | null;
  ventas_quedan: number | null;
  puede_mes_gratis: boolean;
  productos_publicados: number;
};

export type Creditos = { del_plan: number; extra: number; usados: number; quedan: number; costos: Record<string, number> };
