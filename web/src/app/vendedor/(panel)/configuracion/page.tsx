"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Info, XCircle } from "lucide-react";
import { api, ErrorApi, sesion, useApi } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { MedidorClave, claveValida } from "@/components/medidor-clave";
import { DosPasos } from "@/components/dos-pasos";
import { Boton, Campo, Cargando, Entrada, Modal, cn, useAvisar } from "@/components/ui";

type Ajustes = { ruc: string; pausada: boolean; avisos: { pedidos: boolean; consultas: boolean; inventario: boolean } };
type Sesiones = { abiertas: number; password_cambiado_en: string };

const PESTANAS = [
  ["cuenta", "Cuenta"],
  ["seguridad", "Seguridad"],
  ["notificaciones", "Notificaciones"],
  ["preferencias", "Preferencias"],
] as const;
type Pestana = (typeof PESTANAS)[number][0];

function haceCuanto(iso: string) {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 1) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
  const anios = Math.floor(meses / 12);
  return anios === 1 ? "hace 1 año" : `hace ${anios} años`;
}

function Switch({ activo, onChange, deshabilitado }: { activo: boolean; onChange?: (v: boolean) => void; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={deshabilitado}
      onClick={() => onChange?.(!activo)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60", activo ? "bg-pino" : "bg-linea")}
    >
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition", activo ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function Fila({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-linea py-4 first:pt-0 last:border-0 last:pb-0">
      <div>
        <b className="block text-tinta">{titulo}</b>
        {detalle && <p className="text-sm text-gris">{detalle}</p>}
      </div>
      {children}
    </div>
  );
}

const tarjeta = "rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60";

function Cuenta({ ajustes, alGuardar }: { ajustes: Ajustes; alGuardar: () => void }) {
  const yo = useApi<Usuario>("/me");
  const avisar = useAvisar();
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [ruc, setRuc] = useState(ajustes.ruc);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (yo.datos) {
      setNombre(yo.datos.nombre);
      setCorreo(yo.datos.email ?? "");
    }
  }, [yo.datos]);

  if (!yo.datos) return <Cargando />;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.put("/me", { nombre, email: correo });
      await api.put("/vendedor/tienda/ajustes", { ruc });
      avisar("Cuenta actualizada.");
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
        <Campo etiqueta="Nombre">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={3} autoComplete="name" />
        </Campo>
        <Campo etiqueta="Correo">
          <Entrada type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} autoComplete="email" placeholder="tucorreo@ejemplo.com" />
        </Campo>
        <Campo etiqueta="RUC (opcional)" ayuda="Para tus comprobantes">
          <Entrada value={ruc} onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" placeholder="11 dígitos" />
        </Campo>
        <Campo etiqueta="Celular" ayuda="Con este número entras a VendiGo. Para cambiarlo escríbenos a ayuda@vendigo.pe.">
          <Entrada value={yo.datos.celular} disabled className="bg-crema text-gris" />
        </Campo>
      </div>
      <Boton type="submit" className="mt-5" cargando={guardando}>Guardar</Boton>
    </form>
  );
}

function CampoClave({ etiqueta, valor, onChange, autoComplete }: { etiqueta: string; valor: string; onChange: (v: string) => void; autoComplete: string }) {
  const [ver, setVer] = useState(false);
  return (
    <Campo etiqueta={etiqueta}>
      <span className="relative block">
        <Entrada type={ver ? "text" : "password"} value={valor} onChange={(e) => onChange(e.target.value)} required autoComplete={autoComplete} className="pr-11" />
        <button type="button" onClick={() => setVer(!ver)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gris" aria-label={ver ? "Ocultar" : "Ver"}>
          {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </span>
    </Campo>
  );
}

function Seguridad() {
  const { datos, recargar } = useApi<Sesiones>("/me/sesiones");
  const avisar = useAvisar();
  const router = useRouter();
  const [modal, setModal] = useState(false);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repite, setRepite] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!datos) return <Cargando />;
  const otras = Math.max(0, datos.abiertas - 1);

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
      recargar();
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setEnviando(false);
    }
  }

  async function cerrarOtras() {
    try {
      const r = await api.post<{ cerradas: number }>("/me/cerrar-sesiones");
      avisar(r.cerradas ? `Cerramos tu cuenta en ${r.cerradas} ${r.cerradas === 1 ? "equipo" : "equipos"}.` : "No había otros equipos abiertos.");
      recargar();
    } catch (err) {
      avisar((err as ErrorApi).message, "error");
    }
  }

  async function salir() {
    await sesion("salir").catch(() => null);
    router.replace("/ingresar");
  }

  return (
    <div className="space-y-5">
    <div className={tarjeta}>
      <Fila titulo="Contraseña" detalle={`Cambiada ${haceCuanto(datos.password_cambiado_en)}`}>
        <Boton variante="secundario" tamano="sm" onClick={() => { setError(""); setModal(true); }}>Cambiar</Boton>
      </Fila>
      <DosPasos Fila={Fila} />
      <Fila
        titulo="Equipos con tu cuenta abierta"
        detalle={otras ? `Este y ${otras} ${otras === 1 ? "equipo más" : "equipos más"}. Si no reconoces alguno, ciérralos.` : "Solo este equipo."}
      >
        <Boton variante="secundario" tamano="sm" onClick={cerrarOtras} disabled={!otras}>Cerrar en los demás</Boton>
      </Fila>
      <Fila titulo="Cerrar sesión" detalle="Sal de tu cuenta en este equipo.">
        <Boton variante="secundario" tamano="sm" onClick={salir}>Cerrar sesión</Boton>
      </Fila>

      <Modal abierto={modal} onCerrar={() => setModal(false)} titulo="Cambiar contraseña">
        <form onSubmit={cambiar} className="space-y-4">
          <CampoClave etiqueta="Contraseña actual" valor={actual} onChange={setActual} autoComplete="current-password" />
          <div>
            <CampoClave etiqueta="Contraseña nueva" valor={nueva} onChange={setNueva} autoComplete="new-password" />
            <MedidorClave clave={nueva} />
          </div>
          <CampoClave etiqueta="Repite la contraseña nueva" valor={repite} onChange={setRepite} autoComplete="new-password" />
          <p className="text-xs text-gris">Al cambiarla, cerramos tu cuenta en los otros equipos y te dejamos un aviso.</p>
          {error && <p className="text-sm font-semibold text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" cargando={enviando}>Guardar contraseña</Boton>
          </div>
        </form>
      </Modal>
    </div>
    <Accesos />
    </div>
  );
}

type Acceso = { exito: boolean; motivo: string; ip: string; equipo: string; creado_en: string };

// Últimos ingresos a la cuenta: si ve uno que no reconoce, cambia su contraseña.
function Accesos() {
  const { datos } = useApi<{ accesos: Acceso[] }>("/me/accesos");
  return (
    <div className={tarjeta}>
      <h3 className="font-bold text-tinta">Últimos accesos a tu cuenta</h3>
      <p className="mb-3 text-sm text-gris">Si ves uno que no reconoces, cambia tu contraseña.</p>
      {!datos ? (
        <Cargando />
      ) : !datos.accesos.length ? (
        <p className="text-sm text-gris">Aún no hay accesos registrados.</p>
      ) : (
        <ul>
          {datos.accesos.map((a, i) => (
            <li key={i} className="flex items-center gap-3 border-b border-linea py-2.5 text-sm last:border-0">
              {a.exito ? <CheckCircle2 className="size-[18px] shrink-0 text-ok" /> : <XCircle className="size-[18px] shrink-0 text-error" />}
              <span className="min-w-0 flex-1">
                <b className="block text-tinta">{a.exito ? "Ingreso correcto" : `Intento fallido · ${a.motivo}`}</b>
                <span className="text-xs text-gris">{a.equipo}{a.ip ? ` · IP ${a.ip}` : ""}</span>
              </span>
              <span className="whitespace-nowrap text-xs text-gris">
                {new Date(a.creado_en).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Notificaciones({ ajustes, alGuardar }: { ajustes: Ajustes; alGuardar: (a: Ajustes) => void }) {
  const avisar = useAvisar();
  async function cambiar(k: keyof Ajustes["avisos"], v: boolean) {
    try {
      const a = await api.put<Ajustes>("/vendedor/tienda/ajustes", { avisos: { ...ajustes.avisos, [k]: v } });
      alGuardar(a);
    } catch (err) {
      avisar((err as ErrorApi).message, "error");
    }
  }
  return (
    <div className={tarjeta}>
      <Fila titulo="Pedidos nuevos" detalle="Cuando alguien te compra o te pide ayuda con un pedido.">
        <Switch activo={ajustes.avisos.pedidos} onChange={(v) => cambiar("pedidos", v)} />
      </Fila>
      <Fila titulo="Mensajes de clientes" detalle="Preguntas sobre tus productos.">
        <Switch activo={ajustes.avisos.consultas} onChange={(v) => cambiar("consultas", v)} />
      </Fila>
      <Fila titulo="Stock bajo" detalle="Cuando a un producto le quedan pocas unidades.">
        <Switch activo={ajustes.avisos.inventario} onChange={(v) => cambiar("inventario", v)} />
      </Fila>
      <Fila titulo="Pagos y reclamos" detalle="Siempre te avisamos: es tu dinero.">
        <Switch activo deshabilitado />
      </Fila>
      <p className="mt-4 flex gap-1.5 text-xs text-gris"><Info className="mt-0.5 size-3.5 shrink-0" /> Los avisos llegan a la campana de VendiGo. Lo que apagues aquí no se guarda en tus notificaciones.</p>
    </div>
  );
}

function Preferencias({ ajustes, alGuardar }: { ajustes: Ajustes; alGuardar: (a: Ajustes) => void }) {
  const avisar = useAvisar();
  async function pausar(v: boolean) {
    try {
      const a = await api.put<Ajustes>("/vendedor/tienda/ajustes", { pausada: v });
      alGuardar(a);
      avisar(v ? "Tu tienda está en pausa. No recibirás pedidos nuevos." : "Tu tienda está activa otra vez.");
    } catch (err) {
      avisar((err as ErrorApi).message, "error");
    }
  }
  return (
    <div className={tarjeta}>
      <Fila titulo="Pausar mi tienda" detalle="Tus clientes verán que no estás recibiendo pedidos. Tus productos se siguen viendo.">
        <Switch activo={ajustes.pausada} onChange={pausar} />
      </Fila>
      <Fila titulo="Idioma" detalle="Por ahora VendiGo está solo en español.">
        <span className="text-sm font-semibold text-tinta">Español</span>
      </Fila>
    </div>
  );
}

export default function Configuracion() {
  const [pestana, setPestana] = useState<Pestana>("cuenta");
  const { datos: ajustes, setDatos, recargar } = useApi<Ajustes>("/vendedor/tienda/ajustes");

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Configuración</h1>
      </div>
      <div className="flex gap-6 overflow-x-auto border-b border-linea">
        {PESTANAS.map(([k, t]) => (
          <button
            key={k}
            onClick={() => setPestana(k)}
            className={cn("-mb-px whitespace-nowrap border-b-2 pb-3 text-sm font-semibold transition", pestana === k ? "border-coral text-pino" : "border-transparent text-gris hover:text-tinta")}
          >
            {t}
          </button>
        ))}
      </div>
      {!ajustes ? (
        <Cargando />
      ) : pestana === "cuenta" ? (
        <Cuenta ajustes={ajustes} alGuardar={recargar} />
      ) : pestana === "seguridad" ? (
        <Seguridad />
      ) : pestana === "notificaciones" ? (
        <Notificaciones ajustes={ajustes} alGuardar={setDatos} />
      ) : (
        <Preferencias ajustes={ajustes} alGuardar={setDatos} />
      )}
    </div>
  );
}
