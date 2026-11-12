"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Apple, Armchair, Dumbbell, Gem, Headphones, Palette, Shirt, Sparkles, type LucideIcon } from "lucide-react";
import { Aviso, Boton, Campo, Entrada, EntradaClave, cn } from "@/components/ui";
import { api, ErrorApi } from "@/lib/api";
import { MedidorClave, claveValida } from "@/components/medidor-clave";

// Lo que elige aquí se usa para dejar listo el rubro al crear su tienda.
const QUE_VENDES: { id: string; texto: string; icono: LucideIcon }[] = [
  { id: "moda", texto: "Moda", icono: Shirt },
  { id: "belleza", texto: "Belleza", icono: Sparkles },
  { id: "hogar", texto: "Hogar", icono: Armchair },
  { id: "tecnologia", texto: "Tecnología", icono: Headphones },
  { id: "comida", texto: "Alimentos", icono: Apple },
  { id: "artesania", texto: "Artesanías", icono: Palette },
  { id: "accesorios", texto: "Accesorios", icono: Gem },
  { id: "deportes", texto: "Deportes", icono: Dumbbell },
];

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [rol, setRol] = useState<"vendedor" | "comprador">(params.get("tipo") === "comprar" ? "comprador" : "vendedor");
  // Desde el seguimiento de un pedido llegan el nombre y el celular con los que compró.
  const [f, setF] = useState({ nombre: params.get("nombre") ?? "", email: "", celular: params.get("celular") ?? "", password: "" });
  const [rubro, setRubro] = useState("");
  const [acepto, setAcepto] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const cambiar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const vende = rol === "vendedor";

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!claveValida(f.password)) return setError("Tu contraseña debe tener 8 caracteres o más, una mayúscula, una minúscula y un número.");
    if (!acepto) return setError("Acepta los términos y la política de privacidad para continuar.");
    setError("");
    setCargando(true);
    try {
      const r = await api.post<{ celular: string; codigo_dev?: string }>("/auth/registro", { ...f, celular: f.celular.replace(/\s/g, ""), rol });
      const q = new URLSearchParams({ celular: r.celular });
      if (r.codigo_dev) q.set("dev", r.codigo_dev);
      if (vende && rubro) q.set("rubro", rubro);
      const siguiente = params.get("siguiente");
      if (!vende && siguiente?.startsWith("/") && !siguiente.startsWith("//")) q.set("siguiente", siguiente);
      router.push(`/verificar?${q}`);
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <h1 className="text-[31px] font-extrabold leading-tight tracking-[-0.02em] text-pino">{vende ? "Crea tu cuenta de vendedor" : "Crea tu cuenta"}</h1>
        <p className="mt-1.5 text-gris">{vende ? "Solo necesitamos unos datos. Lo demás lo completas después." : "Para seguir tus pedidos y comprar más rápido."}</p>
      </div>

      <div className="grid grid-cols-2 rounded-full bg-white p-1 ring-1 ring-linea">
        {(["comprador", "vendedor"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRol(r)}
            className={cn("h-10 rounded-full text-sm font-semibold transition", rol === r ? "bg-pino text-white" : "text-tinta hover:text-pino")}
          >
            {r === "comprador" ? "Quiero comprar" : "Quiero vender"}
          </button>
        ))}
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      <Campo etiqueta="Nombre y apellido">
        <Entrada value={f.nombre} onChange={cambiar("nombre")} placeholder="Ej. Camila Rojas" autoComplete="name" required minLength={3} />
      </Campo>
      <Campo etiqueta="Correo">
        <Entrada type="email" value={f.email} onChange={cambiar("email")} placeholder="nombre@correo.pe" autoComplete="email" required />
      </Campo>
      <Campo etiqueta="Celular" ayuda="Te enviaremos un código por SMS para confirmar que es tuyo.">
        <Entrada value={f.celular} onChange={cambiar("celular")} placeholder="987 654 321" inputMode="numeric" autoComplete="tel" required />
      </Campo>
      <Campo etiqueta="Contraseña">
        <EntradaClave value={f.password} onChange={cambiar("password")} placeholder="Mínimo 8 caracteres" autoComplete="new-password" minLength={8} required />
        <MedidorClave clave={f.password} />
      </Campo>

      {vende && (
        <div>
          <p className="mb-2 text-sm text-gris">
            <b className="text-tinta">¿Qué vendes?</b> · así dejamos lista tu tienda
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {QUE_VENDES.map(({ id, texto, icono: I }) => {
              const activo = rubro === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setRubro(activo ? "" : id)}
                  aria-pressed={activo}
                  className={cn(
                    "flex h-14 items-center gap-3 rounded-2xl bg-white px-2.5 text-left text-sm font-bold text-tinta ring-1 transition",
                    activo ? "ring-2 ring-pino" : "ring-linea hover:ring-pino/40",
                  )}
                >
                  <span className={cn("grid size-9 place-items-center rounded-xl", activo ? "bg-pino text-white" : "bg-coral-claro text-tinta")}>
                    <I className="size-[18px]" />
                  </span>
                  {texto}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className="flex items-center gap-3 pt-1 text-sm text-tinta">
        <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} className="size-[18px] accent-pino" />
        <span>Acepto los términos y la política de privacidad</span>
      </label>
      <Boton bloque tamano="lg" variante="acento" cargando={cargando}>
        {vende ? "Crear cuenta y configurar mi tienda" : "Crear cuenta"}
      </Boton>
      <p className="text-center text-sm text-gris">
        ¿Ya tienes cuenta?{" "}
        <Link href="/ingresar" className="font-bold text-pino hover:underline">
          Ingresa
        </Link>
      </p>
    </form>
  );
}

export default function Registro() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}
