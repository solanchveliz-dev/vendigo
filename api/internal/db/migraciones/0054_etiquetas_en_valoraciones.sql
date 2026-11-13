-- Respuestas rápidas al calificar (como en inDrive): "Bien empacado", "Llegó tarde"…
-- Se guardan como etiquetas de una lista fija para poder contarlas por tienda.
ALTER TABLE valoraciones ADD COLUMN IF NOT EXISTS etiquetas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE valoraciones DROP CONSTRAINT IF EXISTS valoraciones_etiquetas_check;
ALTER TABLE valoraciones ADD CONSTRAINT valoraciones_etiquetas_check CHECK (cardinality(etiquetas) <= 6);
