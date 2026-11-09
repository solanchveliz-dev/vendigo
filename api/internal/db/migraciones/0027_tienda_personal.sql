-- Más personalización (todo opcional): producto destacado elegido por la tienda,
-- aviso en la parte de arriba y "Conoce a la emprendedora".
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS destacado_id      UUID REFERENCES productos(id) ON DELETE SET NULL;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS aviso             TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS historia          TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS historia_foto_key TEXT;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS vende_desde       INT;
