-- 1. Productos destacados (ingreso extra de VendiGo, como los anuncios de un marketplace).
-- La tienda paga con Yape a VendiGo; al confirmar el pago, el producto sale primero por unos días.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS destacado_hasta TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS productos_destacados_idx ON productos (destacado_hasta) WHERE destacado_hasta IS NOT NULL;

ALTER TABLE pagos_plan DROP CONSTRAINT IF EXISTS pagos_plan_tipo_check;
ALTER TABLE pagos_plan ADD CONSTRAINT pagos_plan_tipo_check CHECK (tipo IN ('plan', 'ventas_extra', 'destacado', 'proteccion'));
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS producto_id UUID REFERENCES productos(id) ON DELETE SET NULL;
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS dias INT NOT NULL DEFAULT 0;

-- 2. Protección VendiGo: extra mensual que paga la tienda. Sus pedidos quedan protegidos: si el pedido
-- no le llega al comprador (reclamo "no llegó" a su favor, o la tienda cancela tras cobrar) y la tienda no le
-- devuelve a tiempo, VendiGo le devuelve de su fondo (con tope) y la tienda queda suspendida hasta reponerlo.
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS proteccion_hasta TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS protegido BOOLEAN NOT NULL DEFAULT false; -- foto al crear el pedido
CREATE TABLE IF NOT EXISTS garantias (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id      UUID NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
    tienda_id      UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    monto_centimos INT NOT NULL CHECK (monto_centimos > 0),
    estado         TEXT NOT NULL DEFAULT 'pagada' CHECK (estado IN ('pagada', 'recuperada')),
    referencia     TEXT NOT NULL DEFAULT '',   -- n.° de operación con el que VendiGo devolvió
    evidencia_key  TEXT,
    nota           TEXT NOT NULL DEFAULT '',
    pagada_por     UUID REFERENCES usuarios(id),
    pagada_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    recuperada_ref TEXT NOT NULL DEFAULT '',   -- n.° de operación con el que la tienda repuso
    recuperada_en  TIMESTAMPTZ
);
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS suspendida_garantia BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE devoluciones DROP CONSTRAINT IF EXISTS devoluciones_estado_check;
ALTER TABLE devoluciones ADD CONSTRAINT devoluciones_estado_check
    CHECK (estado IN ('pendiente_tienda', 'informada_tienda', 'cubierta_vendigo', 'confirmada_proveedor', 'de_prueba'));

INSERT INTO ajustes_plataforma (clave, valor) VALUES
    ('destacado_precio_centimos', '500'), ('destacado_dias', '7'),
    ('garantia_tope_centimos', '15000'), ('garantia_dias_habiles', '5'),
    ('proteccion_precio_centimos', '990')
ON CONFLICT DO NOTHING;
