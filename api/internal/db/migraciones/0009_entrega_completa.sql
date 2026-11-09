-- "¿Cómo entregas y cómo te pagan?" del prototipo: más datos de recojo, costo de agencia y otra modalidad.
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS instrucciones_recojo   TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS dias_recojo            INT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6];
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS adelanto_pct           INT NOT NULL DEFAULT 0 CHECK (adelanto_pct IN (0, 20, 30, 50));
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS costo_agencia_centimos INT NOT NULL DEFAULT 0;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS entrega_otra           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS descripcion_otra       TEXT NOT NULL DEFAULT '';
