"use client";

// Culqi Checkout (v4): la tienda paga a VendiGo con tarjeta o Yape. Culqi tokeniza en su propio formulario;
// el token se envía a la API, que crea el cargo con la llave secreta. VendiGo nunca ve la tarjeta.
type CulqiGlobal = {
  publicKey: string;
  settings: (o: Record<string, unknown>) => void;
  options: (o: Record<string, unknown>) => void;
  open: () => void;
  close: () => void;
  token?: { id: string; email: string };
  error?: { user_message?: string; merchant_message?: string };
};
declare global {
  interface Window {
    Culqi?: CulqiGlobal;
    culqi?: () => void;
  }
}

let cargando: Promise<void> | null = null;
function cargarScript() {
  if (window.Culqi) return Promise.resolve();
  cargando ??= new Promise<void>((ok, mal) => {
    const s = document.createElement("script");
    s.src = "https://checkout.culqi.com/js/v4";
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => {
      cargando = null;
      mal(new Error("No se pudo abrir Culqi. Revisa tu conexión."));
    };
    document.body.appendChild(s);
  });
  return cargando;
}

// Abre el formulario de Culqi y resuelve con el token cuando la tienda termina.
export async function pedirTokenCulqi(llavePublica: string, monto: number, descripcion: string): Promise<{ token: string; email: string }> {
  await cargarScript();
  const C = window.Culqi!;
  C.publicKey = llavePublica;
  C.settings({ title: "VendiGo", currency: "PEN", amount: monto, description: descripcion.slice(0, 80) });
  C.options({ lang: "auto", installments: false, paymentMethods: { tarjeta: true, yape: true, bancaMovil: false, agente: false, billetera: false, cuotealo: false } });
  return new Promise((ok, mal) => {
    window.culqi = () => {
      if (C.token) {
        ok({ token: C.token.id, email: C.token.email });
        C.close();
      } else if (C.error) {
        mal(new Error(C.error.user_message || "Culqi no pudo procesar el pago."));
      }
    };
    C.open();
  });
}
