"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { api, ErrorApi, sesion, useApi } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { MedidorClave, claveValida } from "@/components/medidor-clave";
import { DosPasos } from "@/components/dos-pasos";
import { CambiarNumero } from "@/components/cambiar-numero";
import { Boton, Campo, Cargando, Entrada, EntradaClave, Modal, cn, useAvisar } from "@/components/ui";
import { Titulo } from "@/components/admin/ui";
import { FilaPedido, iniciales, type PedidoComprador } from "@/components/comprador/ui";

type Resumen = { nombre: string; desde: string; pedidos: number; en_curso: number };
const PESTANAS = [
  ["datos", "Datos personales"],
  ["pedidos", "Pedidos recientes"],
  ["seguridad", "Seguridad"],
] as const;
const tarjeta = "rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60";

function Fila({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linea py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="min-w-0">
        <b className="block text-tinta">{titulo}</b>
        {detalle && <p className="text-sm text-gris">{detalle}</p>}
      </div>
      {children}
    </div>
  );
}

// Mi perfil del comprador (prototipo n.° 11).
export default function Perfil() {
  const yo = useApi<Usuario>("/me");
  const r = useApi<Resumen>("/comprador/resumen");
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number][0]>("datos");
  if (!yo.datos || !r.datos) return <Cargando />;
  const u = yo.datos;
  const desde = new Date(r.datos.desde).toLocaleDateString("es-PE", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <Titulo titulo="Mi perfil" migas={<><Link href="/mi-cuenta" className="hover:text-tinta">Inicio</Link> / Perfil</>} />
      <div className={cn(tarjeta, "flex flex-wrap items-center gap-5")}>
        <span className="grid size-[72px] shrink-0 place-items-center rounded-full bg-pino font-display text-2xl font-extrabold text-white">{iniciales(u.nombre)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold text-tinta">{u.nombre}</h2>
          <p className="text-sm text-gris">{u.email || u.celular} · En VendiGo desde {desde}</p>
        </div>
        <div className="flex gap-7">
          <p><b className="font-display text-2xl text-tinta">{r.datos.pedidos}</b><br /><span className="text-sm text-gris">pedidos</span></p>
          <p><b className="font-display text-2xl text-tinta">{r.datos.en_curso}</b><br /><span className="text-sm text-gris">en curso</span></p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-linea">
        {PESTANAS.map(([k, t]) => (
          <button key={k} onClick={() => setPestana(k)} className={cn("-mb-px border-b-2 px-3 pb-3 text-[15px] font-semibold transition", pestana === k ? "border-coral text-tinta" : "border-transparent text-gris hover:text-tinta")}>
            {t}
          </button>
        ))}
      </div>

      {pestana === "datos" && <Datos u={u} alGuardar={yo.recargar} />}
      {pestana === "pedidos" && <Recientes />}
      {pestana === "seguridad" && <Seguridad />}
    </div>
  );
}

function Datos({ u, alGuardar }: { u: Usuario; alGuardar: () => void }) {
  const avisar = useAvisar();
  const [nombre, setNombre] = useState(u.nombre);
  const [correo, setCorreo] = useState(u.email ?? "");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    setNombre(u.nombre);
    setCorreo(u.email ?? "");
  }, [u]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.put("/me", { nombre, email: correo });
      avisar("Cambios guardados.");
      alGuardar();
    } catch (err) {
      avisar((err as ErrorApi).message, "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={guardar} className={tarjeta}>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo etiqueta="Nombre y apellido">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={3} autoComplete="name" />
        </Campo>
        <Campo etiqueta="Correo (opcional)">
          <Entrada type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" placeholder="tucorreo@ejemplo.com" />
        </Campo>
        <Campo etiqueta="Celular" ayuda="Con este número entras y te llegan los avisos de tus pedidos. Cámbialo en Seguridad.">
          <Entrada value={u.celular} disabled className="bg-crema text-gris" />
        </Campo>
      </div>
      <Boton type="submit" className="mt-5" cargando={guardando}>Guardar cambios</Boton>
    </form>
  );
}

function Recientes() {
  const { datos } = useApi<{ pedidos: PedidoComprador[] }>("/comprador/pedidos");
  if (!datos) return <Cargando />;
  if (!datos.pedidos.length) return <p className={cn(tarjeta, "text-sm text-gris")}>Aún no tienes pedidos.</p>;
  return (
    <div className="space-y-3">
      {datos.pedidos.slice(0, 4).map((p) => <FilaPedido key={p.codigo} p={p} />)}
      <Link href="/mi-cuenta/pedidos" className="inline-block text-sm font-bold text-pino hover:underline">Ver todos mis pedidos</Link>
    </div>
  );
}

function Seguridad() {
  const avisar = useAvisar();
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repite, setRepite] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cambiar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!claveValida(nueva)) return setError("La contraseña nueva debe tener 8 caracteres o más, una mayúscula, una minúscula y un número.");
    if (nueva !== repite) return setError("Las contraseñas no coinciden.");
    setEnviando(true);
    try {
      await api.put("/me/password", { actual, nueva });
      setModal(false);
      setActual(""); setNueva(""); setRepite("");
      avisar("Listo, cambiaste tu contraseña. Cerramos tu cuenta en los otros equipos.");
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setEnviando(false);
    }
  }
  async function salir() {
    await sesion("salir").catch(() => null);
    router.replace("/ingresar");
  }

  return (
    <div className={tarjeta}>
      <Fila titulo="Contraseña" detalle="Te pediremos la actual para cambiarla.">
        <Boton variante="secundario" tamano="sm" onClick={() => { setError(""); setModal(true); }}>Cambiar</Boton>
      </Fila>
      <CambiarNumero Fila={Fila} />
      <DosPasos Fila={Fila} />
      <Fila titulo="Cerrar sesión" detalle="Sal de tu cuenta en este equipo.">
        <Boton variante="secundario" tamano="sm" onClick={salir}><LogOut className="size-4" /> Cerrar sesión</Boton>
      </Fila>

      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo="Cambiar contraseña">
        <form onSubmit={cambiar} className="space-y-4">
          <Campo etiqueta="Contraseña actual">
            <EntradaClave value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" required />
          </Campo>
          <Campo etiqueta="Contraseña nueva">
            <EntradaClave value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" required />
            <MedidorClave clave={nueva} />
          </Campo>
          <Campo etiqueta="Repite la contraseña nueva">
            <EntradaClave value={repite} onChange={(e) => setRepite(e.target.value)} autoComplete="new-password" required />
          </Campo>
          {error && <p className="text-sm font-semibold text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" cargando={enviando}>Guardar contraseña</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
