"use client";

import Link from "next/link";
import { ConfirmarIdentidad } from "@/components/confirmar-identidad";
import { useEffect, useState } from "react";
import { Check, ChevronRight, Landmark, Lock, ShieldCheck, Wallet } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { bancos } from "@/lib/catalogos";
import { Aviso, Boton, Campo, Cargando, Entrada, Selector, Tarjeta, useAvisar } from "@/components/ui";

type Cuenta = { banco: string; titular: string; tipo: string; ultimos4: string };

export default function CuentaBancaria() {
  const { datos, setDatos } = useApi<{ cuenta: Cuenta | null }>("/vendedor/cuenta-bancaria");
  const ver = useApi<{ estado: string; tipo_documento?: string; ultimos4?: string; nombre_completo?: string }>("/vendedor/verificacion");
  const avisar = useAvisar();
  const [editar, setEditar] = useState(false);
  const [f, setF] = useState({ banco: "BCP", titular: "", tipo: "ahorros", numero: "", cci: "" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    if (datos && !datos.cuenta) setEditar(true);
    if (datos?.cuenta) setF((x) => ({ ...x, banco: datos.cuenta!.banco, titular: datos.cuenta!.titular, tipo: datos.cuenta!.tipo }));
  }, [datos]);

  if (!datos) return <Cargando />;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setGuardando(true);
    try {
      // La API revisa primero los datos; si están bien, pide confirmar con un código (app o SMS).
      setDatos(await api.put("/vendedor/cuenta-bancaria", f));
      setEditar(false);
      avisar("Cuenta guardada.");
    } catch (err) {
      const x = err as ErrorApi;
      if (x.codigo === "confirmacion_requerida") setConfirmar(true);
      else setError(x.message);
    } finally {
      setGuardando(false);
    }
  }

  async function guardarConCodigo(codigo: string) {
    setGuardando(true);
    try {
      setDatos(await api.put("/vendedor/cuenta-bancaria", { ...f, codigo }));
      setConfirmar(false);
      setEditar(false);
      setF({ ...f, numero: "", cci: "" });
      avisar("Cuenta guardada.");
    } catch (err) {
      const x = err as ErrorApi;
      // Si el error es de los datos (no del código), se cierra la confirmación y se muestra en el formulario.
      if (x.codigo === "datos_invalidos" && !/c[oó]digo/i.test(x.message)) {
        setConfirmar(false);
        setError(x.message);
        return;
      }
      throw err;
    } finally {
      setGuardando(false);
    }
  }

  const v = ver.datos;
  const sinTilde = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const aSuNombre = !!(v?.estado === "aprobada" && datos.cuenta && v.nombre_completo && sinTilde(v.nombre_completo) === sinTilde(datos.cuenta.titular));

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-gris">
        <Link href="/vendedor/cobros" className="hover:text-pino">Mis cobros</Link> <ChevronRight className="size-3.5" /> Cuenta
      </p>
      <div>
        <div className="mb-2 h-1 w-8 rounded-full bg-coral" />
        <h1 className="text-[34px] font-extrabold leading-tight text-pino">Cuenta para tus cobros</h1>
        <p className="text-sm text-gris">Aquí te transferimos lo que se libera de tus ventas.</p>
      </div>

      <Link href="/vendedor/verificacion" className="flex items-center gap-4 rounded-[22px] bg-white p-5 shadow-suave ring-1 ring-linea/60 hover:ring-pino/30">
        <span className="grid size-11 place-items-center rounded-xl bg-crema text-tinta"><ShieldCheck className="size-5" /></span>
        <span className="flex-1">
          <b className="block text-tinta">
            {v?.estado === "aprobada" ? "Identidad verificada" : v?.estado === "pendiente" ? "Identidad en revisión" : v?.estado === "rechazada" ? "Tu verificación fue rechazada" : "Verifica tu identidad"}
          </b>
          <span className="text-sm text-gris">
            {v?.estado === "aprobada" ? `${v.tipo_documento?.toUpperCase()} •••• ${v.ultimos4}` : v?.estado === "pendiente" ? "Te avisamos en menos de 24 horas" : "Necesaria para retirar tu dinero"}
          </span>
        </span>
        <ChevronRight className="size-5 text-tinta" />
      </Link>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {datos.cuenta && !editar ? (
          <section className="space-y-4 rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-crema text-tinta"><Landmark className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <b className="block font-display text-lg text-tinta">{datos.cuenta.banco} · •••• {datos.cuenta.ultimos4}</b>
                <span className="text-sm text-gris">{datos.cuenta.titular} · cuenta de {datos.cuenta.tipo}</span>
              </span>
              {aSuNombre && <span className="rounded-full bg-pino-claro px-2.5 py-1 text-xs font-bold text-pino">● A tu nombre</span>}
            </div>
            <div className="flex gap-2.5 rounded-2xl bg-arena/60 px-4 py-3 text-sm text-tinta">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <span>La cuenta debe estar a tu nombre (el mismo de tu documento). Así nadie puede desviar tus cobros.</span>
            </div>
            <Boton variante="secundario" onClick={() => setEditar(true)}>Cambiar cuenta</Boton>
          </section>
        ) : (
          <form onSubmit={guardar} className="space-y-4">
            {error && <Aviso tono="error">{error}</Aviso>}
            <Tarjeta className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Banco">
                  <Selector value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })}>
                    {bancos.map((b) => <option key={b}>{b}</option>)}
                  </Selector>
                </Campo>
                <Campo etiqueta="Tipo de cuenta">
                  <Selector value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                    <option value="ahorros">Ahorros</option>
                    <option value="corriente">Corriente</option>
                  </Selector>
                </Campo>
              </div>
              <Campo etiqueta="Titular de la cuenta" ayuda="Debe ser la misma persona que verifica su identidad.">
                <Entrada value={f.titular} onChange={(e) => setF({ ...f, titular: e.target.value })} required />
              </Campo>
              <Campo etiqueta="Número de cuenta">
                <Entrada value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} inputMode="numeric" required />
              </Campo>
              <Campo etiqueta="CCI (20 dígitos)" ayuda="Lo encuentras en tu app del banco.">
                <Entrada value={f.cci} onChange={(e) => setF({ ...f, cci: e.target.value })} inputMode="numeric" required />
              </Campo>
            </Tarjeta>
            <p className="flex items-center gap-2 text-sm text-gris">
              <Lock className="size-4" /> Guardamos tu número de cuenta cifrado. Solo mostramos los últimos 4 dígitos.
            </p>
            <div className="flex gap-2">
              {datos.cuenta && (
                <Boton type="button" variante="secundario" onClick={() => setEditar(false)}>
                  Cancelar
                </Boton>
              )}
              <Boton variante="acento" cargando={guardando}>
                Guardar cuenta
              </Boton>
            </div>
          </form>
        )}

        <section className="rounded-[22px] bg-white p-6 shadow-suave ring-1 ring-linea/60">
          <h3 className="mb-4 text-lg font-extrabold text-tinta">¿Cómo te llega el dinero?</h3>
          {[
            [<Lock key="a" className="size-4" />, "Tu cliente paga con Culqi", "El dinero queda retenido hasta que recibe su pedido."],
            [<Check key="b" className="size-4" />, "Se libera", "Cuando confirma, cuando vence el plazo o cuando VendiGo resuelve un reclamo a tu favor."],
            [<Wallet key="c" className="size-4" />, "Lo retiras cuando quieras", "Se libera unos días después de la entrega (según tu reputación) y lo pasas a esta cuenta gratis."],
          ].map(([i, t, d]) => (
            <div key={t as string} className="flex gap-3 py-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-crema text-tinta">{i}</span>
              <span className="text-sm">
                <b className="block text-tinta">{t}</b>
                <span className="text-gris">{d}</span>
              </span>
            </div>
          ))}
        </section>
      </div>
      <ConfirmarIdentidad abierto={confirmar} onCerrar={() => setConfirmar(false)} accion="guardar tu cuenta bancaria" onConfirmar={guardarConCodigo} />
    </div>
  );
}
