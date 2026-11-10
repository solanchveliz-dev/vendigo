import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/legal/pagina";
import { PlazoFondo, TopeFondo } from "@/components/legal/fondo";

export const metadata: Metadata = { title: "Cambios y devoluciones · VendiGo" };

export default function Devoluciones() {
  return (
    <PaginaLegal
      titulo="Cambios y devoluciones"
      intro={<p>En VendiGo le pagas directo a la tienda. Nosotros registramos tu pedido y su pago, te damos el seguimiento y mediamos si algo sale mal.</p>}
      secciones={[
        ["Política de cada tienda", <>
          <p>Cada tienda indica en su página sus condiciones de cambios (por ejemplo, “7 días con empaque original”). Esas condiciones forman parte de tu compra.</p>
        </>],
        ["Si tu pedido no llegó o llegó mal", <>
          <ul>
            <li>Desde el seguimiento de tu pedido, reporta el problema hasta 7 días después de recibirlo.</li>
            <li>Elige el motivo (no llegó, llegó dañado, es distinto o está incompleto) y adjunta fotos.</li>
            <li>La tienda responde con su prueba (por ejemplo, la boleta de envío). Si no hay acuerdo, VendiGo decide con las pruebas de ambos.</li>
            <li>Si pagas al recibir y el pedido no llega, no pagas nada, así que no hace falta reclamar por “No me llegó”.</li>
          </ul>
        </>],
        ["Devolución del dinero", <>
          <ul>
            <li>Si la tienda cancela tu pedido después de que pagaste, o VendiGo resuelve tu reclamo a tu favor, <b>la tienda debe devolverte lo pagado</b>.</li>
            <li>La tienda te devuelve por el mismo medio con el que pagaste (Yape, Plin, transferencia o el proveedor de su link de tarjeta) y lo informa en VendiGo con su comprobante. Lo verás en el seguimiento de tu pedido.</li>
            <li>Con tarjeta, el tiempo en que ves el dinero depende del proveedor de pagos de la tienda y de tu banco.</li>
          </ul>
        </>],
        ["Fondo de emergencia", <>
          <p>Si tu pedido no te llegó (la tienda lo canceló después de cobrar, o VendiGo te dio la razón en un reclamo de “No me llegó”) y la tienda no te devuelve en <PlazoFondo />, VendiGo te devuelve de su fondo de emergencia hasta <TopeFondo /> por pedido. Si tu pedido costaba más, la tienda sigue obligada a devolverte la diferencia.</p>
          <p>El fondo no cubre productos dañados, distintos o incompletos: esas devoluciones las hace la tienda.</p>
        </>],
        ["Productos que no aplican", <>
          <p>Por higiene o naturaleza, algunos productos pueden no aceptar cambios (por ejemplo, alimentos o cosméticos abiertos), siempre que la tienda lo indique antes de la compra. Esto no limita tus derechos si el producto llegó dañado o es distinto a lo publicado.</p>
        </>],
        ["¿Necesitas ayuda?", <>
          <p>Escríbenos al correo de soporte o registra tu caso en el <Link href="/libro-reclamaciones" className="font-semibold underline">Libro de Reclamaciones</Link>.</p>
        </>],
      ]}
    />
  );
}
