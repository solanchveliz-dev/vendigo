-- Revisión de tiendas por el administrador. Las tiendas nuevas se publican al instante
-- y VendiGo las revisa después ("En revisión" hasta que el admin las aprueba).
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS revisada_en TIMESTAMPTZ;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS revisada_por UUID REFERENCES usuarios(id);
-- Suspensión de la tienda (aparte de la suspensión de la cuenta).
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS suspendida_motivo TEXT NOT NULL DEFAULT '';
