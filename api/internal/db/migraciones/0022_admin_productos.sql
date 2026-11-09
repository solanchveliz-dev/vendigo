-- Publicaciones retiradas por el administrador (moderación). Mientras tenga motivo,
-- el producto no se ve en la tienda y la vendedora no puede volver a publicarlo.
ALTER TABLE productos ADD COLUMN IF NOT EXISTS retirado_motivo TEXT NOT NULL DEFAULT '';
ALTER TABLE productos ADD COLUMN IF NOT EXISTS retirado_en TIMESTAMPTZ;
