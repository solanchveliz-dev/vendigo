import type { Metadata } from "next";
import Link from "next/link";
import { PaginaLegal } from "@/components/legal/pagina";

export const metadata: Metadata = { title: "Términos y condiciones · VendiGo" };

export default function Terminos() {
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      intro={<p>Estos términos regulan el uso de VendiGo, una plataforma web que permite a emprendedores crear su tienda virtual, publicar productos y recibir pedidos pagados de forma protegida. Al usar VendiGo aceptas estos términos.</p>}
      secciones={[
        ["Qué es VendiGo", <>
          <p>VendiGo es un intermediario tecnológico: brinda la tienda virtual, el registro de pedidos y el cobro protegido. <b>Cada tienda es la vendedora de sus productos</b> y responde por su calidad, descripción, stock, precio y entrega.</p>
          <p>VendiGo no fabrica, almacena ni transporta productos. Los envíos los hace cada tienda (recojo, agencia o motorizado).</p>
        </>],
        ["Cuentas", <>
          <ul>
            <li>Para vender necesitas una cuenta verificada con tu celular por código SMS.</li>
            <li>Eres responsable de mantener segura tu contraseña. Puedes activar la verificación en dos pasos.</li>
            <li>Para retirar dinero debes verificar tu identidad (DNI) y registrar una cuenta bancaria a tu nombre.</li>
            <li>VendiGo puede suspender cuentas o tiendas que incumplan estos términos, informando el motivo.</li>
          </ul>
        </>],
        ["Pago protegido", <>
          <p>Los compradores pagan con Yape, tarjeta o PagoEfectivo a través de la pasarela Culqi. VendiGo no almacena datos de tarjetas.</p>
          <p>El dinero queda <b>retenido</b> hasta que el comprador confirma que recibió su pedido o se confirma automáticamente a los 7 días del envío. Luego se libera a la tienda según su reputación y el abono de la pasarela (en días hábiles).</p>
          <p>Con delivery por motorizado, la tienda puede ofrecer pago al recibir.</p>
        </>],
        ["Planes y costos", <>
          <p>Crear una tienda es gratis. Los planes de pago amplían ventas al mes, productos y usos de asistencia con IA. VendiGo <b>no cobra comisión por venta</b>; la pasarela de pagos sí descuenta su comisión de cada cobro.</p>
          <p>Si un precio de plan cambia, se avisa a la tienda y se aplica desde su siguiente cobro.</p>
        </>],
        ["Publicaciones", <>
          <p>Está prohibido publicar productos ilegales, falsificados, peligrosos o engañosos, así como usar imágenes de terceros sin autorización. VendiGo puede retirar publicaciones que incumplan estas reglas, indicando el motivo a la tienda.</p>
        </>],
        ["Reclamos entre comprador y tienda", <>
          <p>Si un pedido no llega, llega dañado o es distinto a lo publicado, el comprador puede reportarlo desde su pedido. El dinero queda bloqueado mientras VendiGo revisa las pruebas de ambas partes y decide si se devuelve al comprador o se libera a la tienda.</p>
          <p>Además, cualquier persona puede usar nuestro <Link href="/libro-reclamaciones" className="font-semibold underline">Libro de Reclamaciones</Link>.</p>
        </>],
        ["Responsabilidad", <>
          <p>VendiGo responde por el funcionamiento de la plataforma y el resguardo del dinero retenido. No responde por acuerdos que las partes hagan fuera de la plataforma.</p>
        </>],
        ["Ley aplicable", <>
          <p>Estos términos se rigen por las leyes del Perú, incluido el Código de Protección y Defensa del Consumidor (Ley 29571).</p>
        </>],
      ]}
    />
  );
}
