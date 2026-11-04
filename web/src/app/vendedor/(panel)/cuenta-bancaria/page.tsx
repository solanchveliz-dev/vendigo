"use client";

import { useEffect, useState } from "react";
import { Landmark, Lock } from "lucide-react";
import { api, ErrorApi, useApi } from "@/lib/api";
import { bancos } from "@/lib/catalogos";
import { Aviso, Boton, Campo, Cargando, Encabezado, Entrada, Selector, Tarjeta, useAvisar } from "@/components/ui";

type Cuenta = { banco: string; titular: string; tipo: string; ultimos4: string };

export default function CuentaBancaria() {
  const { datos, setDatos } = useApi<{ cuenta: Cuenta | null }>("/vendedor/cuenta-bancaria");
  const avisar = useAvisar();
  const [editar, setEditar] = useState(false);
  const [f, setF] = useState({ banco: "BCP", titular: "", tipo: "ahorros", numero: "", cci: "" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

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
      setDatos(await api.put("/vendedor/cuenta-bancaria", f));
      setEditar(false);
      setF({ ...f, numero: "", cci: "" });
      avisar("Cuenta guardada.");
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Encabezado titulo="Cuenta para tus cobros" detalle="Aquí depositamos el dinero que retiras de Mis cobros." />
      {datos.cuenta && !editar ? (
        <Tarjeta className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-xl bg-pino-claro text-pino">
            <Landmark className="size-6" />
          </span>
          <div className="flex-1">
            <p className="font-semibold">
              {datos.cuenta.banco} •••• {datos.cuenta.ultimos4}
            </p>
            <p className="text-sm text-gris">
              {datos.cuenta.titular} · Cuenta de {datos.cuenta.tipo}
            </p>
          </div>
          <Boton variante="secundario" onClick={() => setEditar(true)}>
            Cambiar
          </Boton>
        </Tarjeta>
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
    </div>
  );
}
