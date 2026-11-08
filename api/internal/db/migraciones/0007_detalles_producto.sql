-- Detalles del formulario rápido: tipo de producto, colores, características, ficha técnica y opciones elegidas.
-- Se guardan juntos porque cambian según el tipo de producto (no todos tienen tallas o colores).
ALTER TABLE productos ADD COLUMN IF NOT EXISTS detalles JSONB NOT NULL DEFAULT '{}';
