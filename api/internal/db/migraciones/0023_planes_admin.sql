-- El admin puede pausar un plan: las tiendas que ya lo tienen lo conservan,
-- pero nadie nuevo puede elegirlo.
ALTER TABLE planes ADD COLUMN IF NOT EXISTS disponible BOOLEAN NOT NULL DEFAULT true;
