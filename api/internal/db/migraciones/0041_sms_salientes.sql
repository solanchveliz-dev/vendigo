-- Bandeja de salida de SMS: cada aviso se guarda en la misma transacción que el cambio que lo genera
-- (así nunca sale un SMS de algo que no se guardó) y el worker los envía con Amazon SNS, con reintentos.
CREATE TABLE IF NOT EXISTS sms_salientes (
    id         BIGSERIAL PRIMARY KEY,
    celular    TEXT NOT NULL,
    texto      TEXT NOT NULL,
    enlace     TEXT NOT NULL DEFAULT '',   -- ruta de la web; el worker le antepone WEB_URL
    intentos   INT NOT NULL DEFAULT 0,
    error      TEXT NOT NULL DEFAULT '',
    enviado_en TIMESTAMPTZ,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_salientes_pendientes_idx ON sms_salientes (id) WHERE enviado_en IS NULL;
