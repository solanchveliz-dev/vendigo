-- Verificación en dos pasos (TOTP) obligatoria para administradores.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_secreto_cifrado TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_activo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_ultimo_paso BIGINT NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_respaldo TEXT[] NOT NULL DEFAULT '{}'; -- huellas SHA-256, un solo uso

-- Paso intermedio del ingreso: contraseña correcta, falta el código de la app.
CREATE TABLE IF NOT EXISTS mfa_desafios (
    token_hash      TEXT PRIMARY KEY,
    usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    secreto_cifrado TEXT, -- solo al configurar la app por primera vez
    intentos        INT NOT NULL DEFAULT 0,
    expira_en       TIMESTAMPTZ NOT NULL,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
