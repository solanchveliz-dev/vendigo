import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/legal/pagina";
import { PlazoFondo, TopeFondo } from "@/components/legal/fondo";

export const metadata: Metadata = { title: "Términos y condiciones · VendiGo" };

export default function Terminos() {
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      intro={<p>Estos términos regulan el uso de VendiGo, una plataforma web que permite a emprendedores crear su tienda virtual, publicar productos y recibir pedidos, y a los compradores seguir su pedido y reclamar con mediación. Al usar VendiGo aceptas estos términos.</p>}
      secciones={[
        ["Qué es VendiGo", <>
          <p>VendiGo es un intermediario tecnológico: brinda la tienda virtual, el registro y seguimiento de pedidos, y la mediación de reclamos. <b>Cada tienda es la vendedora de sus productos</b> y responde por su calidad, descripción, stock, precio y entrega.</p>
          <p>VendiGo no fabrica, almacena ni transporta productos. Los envíos los hace cada tienda (recojo, agencia o motorizado).</p>
        </>],
        ["Cuentas", <>
          <ul>
            <li>Para vender necesitas una cuenta verificada con tu celular por código SMS.</li>
            <li>Eres responsable de mantener segura tu contraseña. Puedes activar la verificación en dos pasos.</li>
            <li>Puedes verificar tu identidad (DNI) para dar más confianza a tus clientes. El equipo de VendiGo revisa cada solicitud.</li>
            <li>VendiGo puede suspender cuentas o tiendas que incumplan estos términos, informando el motivo.</li>
          </ul>
        </>],
        ["Pagos de los pedidos", <>
          <p><b>VendiGo no recibe, retiene ni administra el dinero de las ventas.</b> El comprador le paga directo a la tienda con los medios que ella publica: Yape, Plin, transferencia bancaria o el link de pago con tarjeta de la propia tienda.</p>
          <p>Cada tienda decide, según la forma de entrega, si se paga todo antes, un adelanto antes y el resto al recibir, o todo al recibir. Los envíos por agencia se pagan completos antes de enviarse.</p>
          <p>El comprador puede subir la captura de su pago y la tienda informa en VendiGo cuando lo recibió. VendiGo registra cada paso para dar seguimiento, pero un pago solo figura como <b>confirmado</b> cuando lo valida un proveedor de pagos autorizado.</p>
          <p>VendiGo no ve ni guarda datos de tarjetas: los procesa el proveedor que elige cada tienda.</p>
        </>],
        ["Planes y costos", <>
          <p>Crear una tienda es gratis. Los planes de pago amplían ventas al mes, productos y usos de asistencia con IA, y la tienda puede comprar ventas extra o impulsar productos para que salgan primero en las búsquedas. VendiGo <b>no cobra comisión por venta</b>.</p>
          <p>Si la tienda usa un link de pago con tarjeta, el proveedor de ese link puede cobrarle su propia comisión; eso es un acuerdo entre la tienda y su proveedor.</p>
          <p>Si un precio de plan cambia, se avisa a la tienda y se aplica desde su siguiente pago.</p>
        </>],
        ["Publicaciones", <>
          <p>Está prohibido publicar productos ilegales, falsificados, peligrosos o engañosos, así como usar imágenes de terceros sin autorización. VendiGo puede retirar publicaciones que incumplan estas reglas, indicando el motivo a la tienda.</p>
        </>],
        ["Entrega y confirmación", <>
          <p>En recojo y motorizado, la entrega se confirma con el código de 4 dígitos que tiene el comprador. En envíos por agencia, el comprador confirma que lo recibió; si no lo confirma ni reclama, se da por recibido a los 7 días del envío.</p>
        </>],
        ["Reclamos entre comprador y tienda", <>
          <p>Si un pedido no llega, llega dañado, incompleto o es distinto a lo publicado, el comprador puede reportarlo desde su pedido hasta 7 días después de recibirlo. La tienda responde con sus pruebas y, si no hay acuerdo, VendiGo revisa las pruebas de ambas partes y decide.</p>
          <p>Si VendiGo da la razón al comprador, el pedido se cancela y <b>la tienda debe devolverle lo pagado</b> e informarlo en VendiGo con su comprobante. Si da la razón a la tienda, el pedido queda como entregado.</p>
          <p>Además, cualquier persona puede usar nuestro <Link href="/libro-reclamaciones" className="font-semibold underline">Libro de Reclamaciones</Link>.</p>
        </>],
        ["Fondo de emergencia de VendiGo", <>
          <p>VendiGo mantiene un fondo propio, que se alimenta con lo que cobra por impulsar productos, para los pedidos que <b>no le llegaron al comprador</b>: cuando la tienda canceló después de cobrar, o cuando VendiGo resolvió a favor del comprador un reclamo de “No me llegó”.</p>
          <p>Si en esos casos la tienda no devuelve el dinero en <PlazoFondo />, VendiGo le devuelve al comprador hasta <TopeFondo /> por pedido. La tienda queda suspendida hasta que reponga a VendiGo lo que este pagó por ella.</p>
          <p>El fondo no cubre productos dañados, distintos o incompletos: en esos casos la devolución corresponde a la tienda.</p>
        </>],
        ["Responsabilidad", <>
          <p>VendiGo responde por el funcionamiento de la plataforma, el seguimiento de los pedidos, la mediación de reclamos y el fondo de emergencia en los casos y montos indicados. No responde por acuerdos ni pagos que las partes hagan fuera de lo registrado en la plataforma.</p>
        </>],
        ["Ley aplicable", <>
          <p>Estos términos se rigen por las leyes del Perú, incluido el Código de Protección y Defensa del Consumidor (Ley 29571).</p>
        </>],
      ]}
    />
  );
}
