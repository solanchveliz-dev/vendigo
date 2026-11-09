-- Personalización de la tienda: color, letra de los títulos y prefijo propio de los pedidos
-- (como Shopify: LUNA-1001, LUNA-1002...). Sin prefijo, los pedidos siguen como VG-…
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS tema_color       TEXT NOT NULL DEFAULT 'clasico';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS tema_fuente      TEXT NOT NULL DEFAULT 'moderna';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS prefijo_pedido   TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS contador_pedidos INT  NOT NULL DEFAULT 1000;
CREATE UNIQUE INDEX IF NOT EXISTS tiendas_prefijo_idx ON tiendas (prefijo_pedido) WHERE prefijo_pedido <> '';
