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
  adelanto_pct: number; // adelanto del recojo
  recojo_pago: "completo" | "adelanto" | "al_recibir";
  motorizado_pago: "completo" | "adelanto" | "al_recibir";
  motorizado_adelanto_pct: number;
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
  enlace: string;
  pausada: boolean;
  yape_numero: string;
  plin_numero: string;
  pago_titular: string;
  pago_qr_key: string | null;
  pago_qr_url: string;
  tarjeta_link: string;
  tarjeta_marcas: string[];
  plin_qr_key: string | null;
  plin_qr_url: string;
  transf_banco: string;
  transf_cuenta: string;
  transf_cci: string;
  transf_titular: string;
  metodos_pago: string[];
  suspendida_garantia: boolean;
  identidad_verificada: boolean; // sin esto la tienda no se muestra a los compradores
  ruc_verificado: boolean; // insignia "Negocio con RUC verificado"
  reclamo_pedido_id: string; // pedido con reclamo "No me llegó" que suspende la tienda ("" si no hay)
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
  destacado_hasta?: string | null; // destacado pagado a VendiGo
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
  pago_texto: string;
  total_centimos: number;
  items: number;
  producto: string;
  imagen_url: string;
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
  comision_reportada_centimos: number; // solo si un proveedor de pagos la informa (VendiGo cobra 0 %)
  neto_centimos: number;
  motivo_cancelacion: string;
  confirmado_por: string | null;
  items_detalle: { nombre: string; variante: string; imagen_url: string; precio_centimos: number; cantidad: number }[];
  envio: {
    agencia: string;
    numero_orden: string;
    clave_recojo: string;
    enlace_rastreo: string;
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
  pago: PagoInfo | null;
  devoluciones: Devolucion[];
  codigo_entrega?: string;
};

// El comprador le paga directo a la tienda; VendiGo solo registra el estado.
export type PagoInfo = {
  estado: "pendiente" | "comprobante_enviado" | "paga_al_recibir" | "adelanto_informado" | "informado_tienda" | "no_recibido" | "confirmado" | "rechazado" | "reembolsado" | "de_prueba";
  texto: string;
  origen: "tienda" | "proveedor" | "prueba";
  metodo: string;
  metodo_texto: string;
  momento: "antes" | "adelanto" | "al_recibir";
  monto_centimos: number;
  adelanto_centimos: number;
  referencia: string;
  comprobante_url: string;
  informado_en: string | null;
  eventos: { estado: string; texto: string; detalle: string; fecha: string }[];
};

export type Devolucion = {
  origen: "cancelacion" | "reclamo";
  monto_centimos: number;
  estado: "pendiente_tienda" | "informada_tienda" | "cubierta_vendigo" | "confirmada_proveedor" | "de_prueba";
  evidencia_url: string;
  nota: string;
  informada_en: string | null;
  creado_en: string;
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

export type Cobros = { pagos_por_confirmar: number; pagos_por_confirmar_centimos: number; devoluciones_pendientes: number };

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

export type Creditos = { del_plan: number; extra: number; usados: number; quedan: number; costos: Record<string, number>; culqi_publica?: string };
