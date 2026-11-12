// Código de la app (6 dígitos) o de respaldo (XXXXX-XXXXX). Acepta minúsculas, espacios y sin guion.
export function formatearCodigo(v: string) {
  const x = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^\d{0,6}$/.test(x)) return x;
  const y = x.slice(0, 10);
  return y.length > 5 ? `${y.slice(0, 5)}-${y.slice(5)}` : y;
}

export const codigoCompleto = (c: string) => /^\d{6}$/.test(c) || /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(c);

// Solo código de respaldo: letras y números, con el guion en su sitio (XXXXX-XXXXX).
export function formatearRespaldo(v: string) {
  const y = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  return y.length > 5 ? `${y.slice(0, 5)}-${y.slice(5)}` : y;
}

export const respaldoCompleto = (c: string) => /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(c);
