-- Cambio del número de celular de una cuenta.
-- Con sesión (sabe su contraseña) el cambio es inmediato. Sin acceso a su número, la persona envía una
-- solicitud con su DNI y una selfie, y un administrador la compara con su verificación de identidad.
CREATE TABLE IF NOT EXISTS solicitudes_celular (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    celular_anterior TEXT NOT NULL,
    celular_nuevo    TEXT NOT NULL CHECK (celular_nuevo ~ '^9[0-9]{8}$'),
    frente_key       TEXT NOT NULL,
    selfie_key       TEXT NOT NULL,
    estado           TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    motivo_rechazo   TEXT NOT NULL DEFAULT '',
    ip               TEXT NOT NULL DEFAULT '',
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),
    revisado_en      TIMESTAMPTZ,
    revisado_por     UUID REFERENCES usuarios(id)
);
-- Una sola solicitud pendiente por cuenta.
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_celular_pendiente_idx ON solicitudes_celular (usuario_id) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS solicitudes_celular_estado_idx ON solicitudes_celular (estado, creado_en DESC);

-- Código que llega al número nuevo antes de cambiarlo.
ALTER TABLE codigos_otp DROP CONSTRAINT IF EXISTS codigos_otp_proposito_check;
ALTER TABLE codigos_otp ADD CONSTRAINT codigos_otp_proposito_check
    CHECK (proposito IN ('registro', 'recuperar', 'confirmar', 'compra', 'cambio_celular'));
