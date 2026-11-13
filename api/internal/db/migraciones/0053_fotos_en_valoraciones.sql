-- Fotos opcionales de cómo le llegó el pedido al cliente (hasta 3), guardadas en el bucket privado.
ALTER TABLE valoraciones ADD COLUMN IF NOT EXISTS foto_keys TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE valoraciones DROP CONSTRAINT IF EXISTS valoraciones_fotos_check;
ALTER TABLE valoraciones ADD CONSTRAINT valoraciones_fotos_check CHECK (cardinality(foto_keys) <= 3);
