"use client";

import { useState } from "react";
import { api, ErrorApi, useApi } from "@/lib/api";
import type { Usuario } from "@/lib/tipos";
import { Aviso, Boton, Campo, Entrada, EntradaClave, Modal, useAvisar } from "@/components/ui";

// Cambiar el número con sesión: código al número nuevo + contraseña (+ app autenticadora si la usa).
// Si la persona ya no tiene su número anterior no importa: el código llega al nuevo.
export function CambiarNumero({ Fila }: { Fila: (p: { titulo: string; detalle?: string; children: React.ReactNode }) => React.ReactNode }) {
  const yo = useApi<Usuario>("/me");
  const mfa = useApi<{ activo: boolean }>("/me/mfa");
  const avisar = useAvisar();
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [dev, setDev] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [dosPasos, setDosPasos] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const limpio = nuevo.replace(/\s/g, "").replace(/^\+51/, "");

  function abrir() {
    setNuevo(""); setEnviado(false); setDev(false); setCodigo(""); setPassword(""); setDosPasos(""); setError("");
    setAbierto(true);
  }

  async function pedirCodigo() {
    setError("");
    setCargando(true);
    try {
      const r = await api.post<{ codigo_dev?: string }>("/me/celular/codigo", { celular_nuevo: limpio });
      if (r.codigo_dev) {
        setCodigo(r.codigo_dev);
        setDev(true);
      }
      setEnviado(true);
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!enviado) return void pedirCodigo();
    setError("");
    setCargando(true);
    try {
      await api.post("/me/celular", { celular_nuevo: limpio, codigo, password, codigo_dos_pasos: dosPasos });
      setAbierto(false);
      avisar("Listo, cambiaste tu número. Cerramos tu cuenta en los otros equipos.");
      yo.recargar();
    } catch (err) {
      setError((err as ErrorApi).message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <>
      <Fila titulo="Número de celular" detalle={yo.datos ? `Entras y recibes tus códigos en el ${yo.datos.celular}.` : undefined}>
        <Boton variante="secundario" tamano="sm" onClick={abrir}>Cambiar</Boton>
      </Fila>
      <Modal abierto={abierto} onCerrar={() => setAbierto(false)} titulo="Cambiar número de celular">
        <form onSubmit={guardar} className="space-y-4">
          <Campo etiqueta="Número nuevo">
            <Entrada value={nuevo} onChange={(e) => { setNuevo(e.target.value); setEnviado(false); setCodigo(""); }} placeholder="987 654 321" inputMode="numeric" autoComplete="tel" required />
          </Campo>
          {enviado && (
            <>
              {dev && <Aviso>Modo de prueba: el SMS no se envía y el código se completó solo.</Aviso>}
              <Campo etiqueta="Código que llegó al número nuevo">
                <Entrada value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" required />
              </Campo>
              <Campo etiqueta="Tu contraseña">
                <EntradaClave value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </Campo>
              {mfa.datos?.activo && (
                <Campo etiqueta="Código de tu app de autenticación" ayuda="O uno de tus códigos de respaldo.">
                  <Entrada value={dosPasos} onChange={(e) => setDosPasos(e.target.value)} autoComplete="one-time-code" required />
                </Campo>
              )}
              <button type="button" onClick={pedirCodigo} className="text-sm font-semibold text-pino hover:underline">Enviar otro código</button>
            </>
          )}
          <p className="text-xs text-gris">Al cambiarlo cerramos tu cuenta en los otros equipos y avisamos por SMS a tu número anterior.</p>
          {error && <p className="text-sm font-semibold text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="secundario" onClick={() => setAbierto(false)}>Cancelar</Boton>
            <Boton type="submit" cargando={cargando} disabled={enviado && codigo.length !== 6}>{enviado ? "Cambiar número" : "Enviar código"}</Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
