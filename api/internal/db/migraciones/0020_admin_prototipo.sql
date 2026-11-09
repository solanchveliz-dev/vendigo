-- Panel del administrador fiel al prototipo.

-- Número corto y correlativo de cada retiro (R-0001), como en el prototipo.
ALTER TABLE retiros ADD COLUMN IF NOT EXISTS numero BIGSERIAL;

-- Intentos de entrar a una sección sin permiso (por ejemplo, un vendedor al panel admin).
CREATE TABLE IF NOT EXISTS accesos_denegados (
    id         BIGSERIAL PRIMARY KEY,
    usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    rol        TEXT NOT NULL,
    ruta       TEXT NOT NULL,
    ip         TEXT NOT NULL DEFAULT '',
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accesos_denegados_fecha_idx ON accesos_denegados (creado_en DESC);

-- Ajustes de la plataforma que cambia el administrador.
CREATE TABLE IF NOT EXISTS ajustes_plataforma (
    clave          TEXT PRIMARY KEY,
    valor          TEXT NOT NULL,
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO ajustes_plataforma (clave, valor) VALUES ('inactividad_admin_min', '30') ON CONFLICT DO NOTHING;
