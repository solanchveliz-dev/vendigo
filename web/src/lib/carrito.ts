"use client";

// Pedido en armado (por tienda). Vive solo en este navegador; el precio final lo calcula la API al crear el pedido.
export type ItemCarrito = {
  producto_id: string;
  variante_id: string;
  cantidad: number;
  nombre: string;
  variante: string;
  precio_centimos: number;
  imagen_url: string;
  stock: number;
};

const clave = (slug: string) => `vendigo:pedido:${slug}`;
// La separación del Modo live va aparte del carrito normal: un solo producto y no se mezcla con lo que ya tenías.
const claveLive = (slug: string) => `vendigo:live:${slug}`;

// "Comprar ahora": solo ese producto, aparte del pedido que la persona va armando (no lo toca ni lo suma).
const claveAhora = (slug: string) => `vendigo:ahora:${slug}`;

export function leerCompraDirecta(slug: string): ItemCarrito[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(claveAhora(slug)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function guardarCompraDirecta(slug: string, items: ItemCarrito[]) {
  try {
    if (items.length) sessionStorage.setItem(claveAhora(slug), JSON.stringify(items));
    else sessionStorage.removeItem(claveAhora(slug));
  } catch {
    // Sin almacenamiento: la compra sigue en la página actual.
  }
}

export function leerSeparacion(slug: string): ItemCarrito[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(claveLive(slug)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function guardarSeparacion(slug: string, items: ItemCarrito[]) {
  try {
    if (items.length) sessionStorage.setItem(claveLive(slug), JSON.stringify(items));
    else sessionStorage.removeItem(claveLive(slug));
  } catch {
    // Sin almacenamiento: la separación sigue en la página actual.
  }
}

export function leerCarrito(slug: string): ItemCarrito[] {
  try {
    const v = JSON.parse(localStorage.getItem(clave(slug)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function guardarCarrito(slug: string, items: ItemCarrito[]) {
  try {
    if (items.length) localStorage.setItem(clave(slug), JSON.stringify(items));
    else localStorage.removeItem(clave(slug));
  } catch {
    // Sin almacenamiento (modo privado): el pedido sigue en la página actual.
  }
}

export function agregarAlCarrito(slug: string, item: ItemCarrito) {
  const items = leerCarrito(slug);
  const igual = items.find((x) => x.producto_id === item.producto_id && x.variante_id === item.variante_id);
  if (igual) igual.cantidad = Math.min(item.stock || igual.cantidad + item.cantidad, igual.cantidad + item.cantidad);
  else items.push(item);
  guardarCarrito(slug, items);
  return items;
}
