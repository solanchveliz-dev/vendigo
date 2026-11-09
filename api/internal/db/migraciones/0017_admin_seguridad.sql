-- Seguridad de las cuentas y panel del administrador.

-- Bloqueo temporal tras varios intentos fallidos y motivo de suspensión.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos INT NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS suspendido_motivo TEXT NOT NULL DEFAULT '';

-- Historial de accesos (exitosos y fallidos) que la persona ve en Seguridad.
CREATE TABLE IF NOT EXISTS accesos (
    id         BIGSERIAL PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    exito      BOOLEAN NOT NULL,
    motivo     TEXT NOT NULL DEFAULT '',
    ip         TEXT NOT NULL DEFAULT '',
    agente     TEXT NOT NULL DEFAULT '',
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accesos_usuario_idx ON accesos (usuario_id, creado_en DESC);

-- Lo que registra el administrador al revisar.
ALTER TABLE retiros ADD COLUMN IF NOT EXISTS operacion TEXT NOT NULL DEFAULT '';
ALTER TABLE retiros ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT NOT NULL DEFAULT '';
ALTER TABLE reclamos ADD COLUMN IF NOT EXISTS nota_admin TEXT NOT NULL DEFAULT '';
ALTER TABLE verificaciones ADD COLUMN IF NOT EXISTS revisado_por UUID REFERENCES usuarios(id);
CREATE INDEX IF NOT EXISTS auditoria_fecha_idx ON auditoria (creado_en DESC);
