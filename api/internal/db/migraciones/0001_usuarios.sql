CREATE TABLE usuarios (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre             TEXT NOT NULL,
    celular            TEXT NOT NULL UNIQUE,
    email              TEXT UNIQUE,
    password_hash      TEXT NOT NULL,
    rol                TEXT NOT NULL DEFAULT 'comprador' CHECK (rol IN ('comprador', 'vendedor', 'admin')),
    celular_verificado BOOLEAN NOT NULL DEFAULT false,
    activo             BOOLEAN NOT NULL DEFAULT true,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE codigos_otp (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    celular     TEXT NOT NULL,
    proposito   TEXT NOT NULL CHECK (proposito IN ('registro', 'recuperar')),
    codigo_hash TEXT NOT NULL,
    intentos    INT NOT NULL DEFAULT 0,
    usado       BOOLEAN NOT NULL DEFAULT false,
    expira_en   TIMESTAMPTZ NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX codigos_otp_celular_idx ON codigos_otp (celular, proposito, creado_en DESC);

CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expira_en  TIMESTAMPTZ NOT NULL,
    revocado   BOOLEAN NOT NULL DEFAULT false,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auditoria (
    id         BIGSERIAL PRIMARY KEY,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    accion     TEXT NOT NULL,
    entidad    TEXT NOT NULL,
    entidad_id TEXT,
    datos      JSONB,
    ip         TEXT,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
