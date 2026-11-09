-- Consultas del prototipo: respuestas automáticas (sin IA), respuestas rápidas,
-- ayuda dentro de cada pedido y tipos de notificación para los filtros.
ALTER TABLE preguntas ADD COLUMN IF NOT EXISTS automatica BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tiendas   ADD COLUMN IF NOT EXISTS respuestas_automaticas BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tiendas   ADD COLUMN IF NOT EXISTS respuestas_creadas     BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS respuestas_rapidas (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tienda_id UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    titulo    TEXT NOT NULL,
    texto     TEXT NOT NULL,
    auto      BOOLEAN NOT NULL DEFAULT false,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS respuestas_rapidas_tienda_idx ON respuestas_rapidas (tienda_id, creado_en);

-- "Ayuda con mi pedido": el cliente escribe dentro de su pedido y la tienda responde ahí.
CREATE TABLE IF NOT EXISTS ayudas_pedido (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
    motivo    TEXT NOT NULL,
    abierta   BOOLEAN NOT NULL DEFAULT true,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ayuda_mensajes (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ayuda_id  UUID NOT NULL REFERENCES ayudas_pedido(id) ON DELETE CASCADE,
    autor     TEXT NOT NULL CHECK (autor IN ('cliente', 'tienda')),
    texto     TEXT NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'pedidos';
UPDATE notificaciones SET tipo = CASE
    WHEN enlace LIKE '/vendedor/cobros%' OR enlace LIKE '/vendedor/plan%' THEN 'pagos'
    WHEN enlace LIKE '/vendedor/consultas%' THEN 'consultas'
    WHEN enlace LIKE '/vendedor/productos%' THEN 'inventario'
    ELSE 'pedidos' END
WHERE tipo = 'pedidos';
