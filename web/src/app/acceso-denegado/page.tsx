import Link from "next/link";
import { Lock } from "lucide-react";

export default function AccesoDenegado() {
  return (
    <main className="grid min-h-screen place-items-center bg-crema px-5">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-white text-pino ring-1 ring-linea"><Lock className="size-7" /></span>
        <h1 className="font-display text-3xl font-extrabold text-pino">No tienes acceso a esta sección</h1>
        <p className="mt-2 text-gris">Tu cuenta no tiene permiso para entrar aquí. El intento quedó registrado por seguridad.</p>
        <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-full bg-pino px-6 font-semibold text-white">Volver al inicio</Link>
      </div>
    </main>
  );
}
