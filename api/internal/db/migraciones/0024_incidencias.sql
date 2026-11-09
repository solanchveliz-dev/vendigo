-- Incidencias: casos que el equipo de VendiGo abre y sigue (un pedido que no llegó,
-- una publicación engañosa, un problema con un pago...). Las notas son internas.
CREATE SEQUENCE IF NOT EXISTS incidencias_numero_seq START 100;
CREATE TABLE IF NOT EXISTS incidencias (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero          BIGINT NOT NULL UNIQUE DEFAULT nextval('incidencias_numero_seq'),
    titulo          TEXT NOT NULL,
    descripcion     TEXT NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('entrega', 'producto', 'pago', 'publicacion', 'cuenta', 'otro')),
    prioridad       TEXT NOT NULL CHECK (prioridad IN ('alta', 'media', 'baja')),
    estado          TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'en_revision', 'resuelta')),
    origen          TEXT NOT NULL CHECK (origen IN ('comprador', 'vendedor', 'equipo')),
    reportado_por   TEXT NOT NULL,
    tienda_id       UUID REFERENCES tiendas(id) ON DELETE SET NULL,
    pedido_id       UUID REFERENCES pedidos(id) ON DELETE SET NULL,
    creado_por      UUID REFERENCES usuarios(id),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resuelta_en     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS incidencias_estado_idx ON incidencias (estado, creado_en DESC);
CREATE TABLE IF NOT EXISTS incidencia_notas (
    id            BIGSERIAL PRIMARY KEY,
    incidencia_id UUID NOT NULL REFERENCES incidencias(id) ON DELETE CASCADE,
    autor_id      UUID REFERENCES usuarios(id),
    autor         TEXT NOT NULL,
    texto         TEXT NOT NULL,
    creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
