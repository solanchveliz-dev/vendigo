-- Modo live: la vendedora transmite en TikTok, Facebook o Instagram y comparte el enlace de su tienda.
-- "Separar" un producto crea un PEDIDO NORMAL con un plazo de pago corto (minutos); si no se paga a tiempo,
-- se cancela solo y el stock vuelve (la misma regla del plazo de pago de 24 h). Una separación no es un pago.
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS live_activo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS live_minutos INT NOT NULL DEFAULT 5;
ALTER TABLE tiendas DROP CONSTRAINT IF EXISTS tiendas_live_minutos_check;
ALTER TABLE tiendas ADD CONSTRAINT tiendas_live_minutos_check CHECK (live_minutos IN (3, 5, 10, 15));
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS live_desde TIMESTAMPTZ;

-- Producto en el live = tiene un código corto ("Código 12") que la vendedora dice en la transmisión.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS live_codigo INT;
ALTER TABLE productos DROP CONSTRAINT IF EXISTS productos_live_codigo_check;
ALTER TABLE productos ADD CONSTRAINT productos_live_codigo_check CHECK (live_codigo BETWEEN 1 AND 999);
CREATE UNIQUE INDEX IF NOT EXISTS productos_live_codigo_idx ON productos (tienda_id, live_codigo) WHERE live_codigo IS NOT NULL;

-- Pedidos que nacieron en un live (para el tablero de la vendedora).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS del_live BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS pedidos_live_idx ON pedidos (tienda_id, creado_en) WHERE del_live;
