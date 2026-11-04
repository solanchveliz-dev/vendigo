CREATE TABLE cuentas_bancarias (
    tienda_id        UUID PRIMARY KEY REFERENCES tiendas(id) ON DELETE CASCADE,
    banco            TEXT NOT NULL,
    titular          TEXT NOT NULL,
    tipo             TEXT NOT NULL CHECK (tipo IN ('ahorros', 'corriente')),
    numero_cifrado   TEXT NOT NULL,
    cci_cifrado      TEXT NOT NULL,
    ultimos4         TEXT NOT NULL,
    actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verificación de identidad: necesaria para retirar dinero.
CREATE TABLE verificaciones (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tienda_id         UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    tipo_documento    TEXT NOT NULL CHECK (tipo_documento IN ('dni', 'ruc', 'ce')),
    numero_cifrado    TEXT NOT NULL,
    ultimos4          TEXT NOT NULL,
    nombre_completo   TEXT NOT NULL,
    frente_key        TEXT NOT NULL,
    reverso_key       TEXT,
    selfie_key        TEXT NOT NULL,
    estado            TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    motivo_rechazo    TEXT NOT NULL DEFAULT '',
    revisado_en       TIMESTAMPTZ,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX verificaciones_tienda_idx ON verificaciones (tienda_id, creado_en DESC);

CREATE TABLE retiros (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tienda_id      UUID NOT NULL REFERENCES tiendas(id),
    monto_centimos INT NOT NULL CHECK (monto_centimos > 0),
    banco          TEXT NOT NULL,
    ultimos4       TEXT NOT NULL,
    estado         TEXT NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso', 'pagado', 'rechazado')),
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    pagado_en      TIMESTAMPTZ
);

-- Ventas adicionales compradas cuando se acaba el cupo del plan (+20 por S/ 5).
CREATE TABLE ventas_extra (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tienda_id      UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    cantidad       INT NOT NULL,
    monto_centimos INT NOT NULL,
    periodo        DATE NOT NULL,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pagos_plan (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tienda_id      UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    concepto       TEXT NOT NULL,
    monto_centimos INT NOT NULL,
    metodo         TEXT NOT NULL DEFAULT 'tarjeta',
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
