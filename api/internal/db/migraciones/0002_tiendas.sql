CREATE TABLE planes (
    id             TEXT PRIMARY KEY,
    nombre         TEXT NOT NULL,
    precio_centimos INT NOT NULL,
    ventas_mes     INT,          -- NULL = ilimitadas
    creditos_ia    INT NOT NULL,
    orden          INT NOT NULL
);

INSERT INTO planes (id, nombre, precio_centimos, ventas_mes, creditos_ia, orden) VALUES
    ('gratis',   'Gratis',   0,    15,   30,   1),
    ('emprende', 'Emprende', 1900, 80,   300,  2),
    ('crece',    'Crece',    3900, 250,  1000, 3),
    ('pro',      'Pro',      6900, NULL, 3000, 4);

CREATE TABLE tiendas (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id         UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
    nombre             TEXT NOT NULL,
    slug               TEXT NOT NULL UNIQUE,
    rubro              TEXT NOT NULL,
    descripcion        TEXT NOT NULL DEFAULT '',
    ciudad             TEXT NOT NULL,
    distrito           TEXT NOT NULL DEFAULT '',
    logo_key           TEXT,
    portada_key        TEXT,
    instagram          TEXT NOT NULL DEFAULT '',
    facebook           TEXT NOT NULL DEFAULT '',
    tiktok             TEXT NOT NULL DEFAULT '',
    whatsapp           TEXT NOT NULL DEFAULT '',
    -- Formas de entrega
    entrega_recojo     BOOLEAN NOT NULL DEFAULT true,
    direccion_recojo   TEXT NOT NULL DEFAULT '',
    horario_recojo     TEXT NOT NULL DEFAULT '',
    entrega_agencia    BOOLEAN NOT NULL DEFAULT true,
    agencias           TEXT[] NOT NULL DEFAULT ARRAY['Shalom']::TEXT[],
    entrega_motorizado BOOLEAN NOT NULL DEFAULT false,
    costo_motorizado_centimos INT NOT NULL DEFAULT 0,
    zonas_motorizado   TEXT NOT NULL DEFAULT '',
    -- Reputación: nueva, buena o excelente (define en cuántos días se libera el dinero)
    reputacion         TEXT NOT NULL DEFAULT 'nueva' CHECK (reputacion IN ('nueva', 'buena', 'excelente')),
    activa             BOOLEAN NOT NULL DEFAULT true,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suscripciones (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tienda_id    UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    plan_id      TEXT NOT NULL REFERENCES planes(id),
    inicio       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fin          TIMESTAMPTZ,
    mes_gratis   BOOLEAN NOT NULL DEFAULT false,
    monto_centimos INT NOT NULL DEFAULT 0,
    activa       BOOLEAN NOT NULL DEFAULT true,
    creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX suscripciones_activa_idx ON suscripciones (tienda_id) WHERE activa;
