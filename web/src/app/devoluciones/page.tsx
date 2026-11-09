import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/legal/pagina";

export const metadata: Metadata = { title: "Cambios y devoluciones · VendiGo" };

export default function Devoluciones() {
  return (
    <PaginaLegal
      titulo="Cambios y devoluciones"
      intro={<p>En VendiGo tu dinero está protegido: la tienda recién lo recibe cuando confirmas que tu pedido llegó bien.</p>}
      secciones={[
        ["Política de cada tienda", <>
          <p>Cada tienda indica en su página sus condiciones de cambios (por ejemplo, “7 días con empaque original”). Esas condiciones forman parte de tu compra.</p>
        </>],
        ["Si tu pedido no llegó o llegó mal", <>
          <ul>
            <li>Desde tu pedido, reporta el problema antes de confirmar que lo recibiste.</li>
            <li>Elige el motivo (no llegó, llegó dañado, es distinto o está incompleto) y adjunta fotos.</li>
            <li>El dinero queda bloqueado: la tienda no lo recibe mientras se revisa.</li>
            <li>La tienda responde con su prueba (por ejemplo, la boleta de envío). Si no hay acuerdo, VendiGo decide con las pruebas de ambos.</li>
          </ul>
        </>],
        ["Devolución del dinero", <>
          <ul>
            <li>Si la tienda no puede atender tu pedido o lo cancela, se te devuelve todo lo pagado.</li>
            <li>Si el reclamo se resuelve a tu favor, se te devuelve el monto por el mismo medio de pago.</li>
            <li>Los tiempos de devolución dependen del medio de pago y de la pasarela (Culqi) y del banco emisor.</li>
          </ul>
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
