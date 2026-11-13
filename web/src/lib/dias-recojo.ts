// Días que se pueden elegir para recoger en tienda: desde hoy y por dos semanas (como valida la API),
// solo los que la tienda atiende (0 = domingo … 6 = sábado). Las fechas se cuentan en hora del Perú.

export type DiaRecojo = { valor: string; titulo: string; fecha: string };

const CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

// "AAAA-MM-DD" de una fecha en hora de Lima, sin depender de la zona horaria del celular.
function enLima(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function diasParaRecoger(atiende: number[] | undefined, cuantos = 6, ahora = new Date()): DiaRecojo[] {
  const hoy = enLima(ahora);
  const base = new Date(`${hoy}T12:00:00Z`); // mediodía: así sumar días nunca cruza de fecha por la zona horaria
  const out: DiaRecojo[] = [];
  for (let i = 0; i < 14 && out.length < cuantos; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const semana = d.getUTCDay();
    if (atiende?.length && !atiende.includes(semana)) continue;
    const valor = d.toISOString().slice(0, 10);
    out.push({
      valor,
      titulo: i === 0 ? "Hoy" : i === 1 ? "Mañana" : CORTOS[semana],
      fecha: `${valor.slice(8, 10)}/${valor.slice(5, 7)}`,
    });
  }
  return out;
}

// "sáb 14/11" para mostrar el día guardado en un pedido.
export function textoDiaRecojo(valor: string) {
  const d = new Date(`${valor}T12:00:00Z`);
  return `${CORTOS[d.getUTCDay()].toLowerCase()} ${valor.slice(8, 10)}/${valor.slice(5, 7)}`;
}
