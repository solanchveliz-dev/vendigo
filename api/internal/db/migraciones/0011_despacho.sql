-- "¿Ya salió con el motorizado?": quién lleva el pedido (el cliente ve su nombre y celular)
-- y la lista de motorizados guardados de la tienda.
ALTER TABLE envios  ADD COLUMN IF NOT EXISTS motorizado_nombre  TEXT NOT NULL DEFAULT '';
ALTER TABLE envios  ADD COLUMN IF NOT EXISTS motorizado_celular TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS motorizados JSONB NOT NULL DEFAULT '[]';
