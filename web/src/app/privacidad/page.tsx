import type { Metadata } from "next";
import { PaginaLegal } from "@/components/legal/pagina";

export const metadata: Metadata = { title: "Política de privacidad · VendiGo" };

export default function Privacidad() {
  return (
    <PaginaLegal
      titulo="Política de privacidad"
      intro={<p>Cuidamos tus datos personales conforme a la Ley N.° 29733, Ley de Protección de Datos Personales del Perú, y su reglamento.</p>}
      secciones={[
        ["Qué datos usamos", <>
          <ul>
            <li><b>Vendedoras:</b> nombre, celular, correo, datos de la tienda, DNI si verifica su identidad y los datos de cobro que decide publicar (número de Yape o Plin y su QR, titular, cuenta o CCI para transferencias y link de pago con tarjeta).</li>
            <li><b>Compradores:</b> nombre, celular, DNI (para recoger en agencia), dirección de entrega y la captura del pago o las fotos de un reclamo, si las sube.</li>
            <li><b>Uso de la plataforma:</b> inicios de sesión, dispositivo e IP, para tu seguridad.</li>
          </ul>
        </>],
        ["Para qué los usamos", <>
          <ul>
            <li>Crear y proteger tu cuenta (código SMS, verificación en dos pasos, avisos de inicio de sesión).</li>
            <li>Registrar y entregar pedidos, y resolver reclamos.</li>
            <li>Mostrarle al comprador cómo pagarle a la tienda, dar seguimiento a ese pago y a las devoluciones, y prevenir fraudes.</li>
          </ul>
          <p>No vendemos tus datos. La tienda solo ve los datos necesarios para entregar tu pedido.</p>
        </>],
        ["Cómo los protegemos", <>
          <ul>
            <li>Las contraseñas se guardan cifradas con un algoritmo de un solo sentido; nadie puede verlas.</li>
            <li>El DNI se guarda cifrado y los documentos de identidad solo los ve el equipo de verificación, quedando registrado cada acceso.</li>
            <li>VendiGo no recibe el dinero de las ventas ni guarda datos de tarjetas: los pagos con tarjeta los procesa el proveedor que elige cada tienda, y los pagos a VendiGo por planes o impulsos, Culqi.</li>
            <li>Las capturas de pago, las fotos de reclamos y los documentos de identidad se guardan en un almacenamiento privado y solo se abren con enlaces temporales.</li>
            <li>Los datos se alojan en servicios de nube con acceso restringido.</li>
          </ul>
        </>],
        ["Tus derechos", <>
          <p>Puedes pedir acceso, rectificación, cancelación u oposición al uso de tus datos (derechos ARCO) escribiendo al correo de soporte. Responderemos en los plazos que establece la ley.</p>
        </>],
        ["Conservación", <>
          <p>Guardamos los datos mientras tengas una cuenta activa y el tiempo que exijan las obligaciones legales, tributarias y de atención de reclamos.</p>
          <p>VendiGo ya no pide cuentas bancarias para retiros. Si registraste una en la versión anterior, ya no se usa y eliminaremos su número completo y su CCI; solo se conservarán el nombre del banco y los últimos 4 dígitos en el historial de las transferencias que ya se hicieron.</p>
        </>],
      ]}
    />
  );
}
