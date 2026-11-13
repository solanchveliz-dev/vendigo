-- Ubicación de cada sede de agencia, para que el comprador encuentre la más cercana a él.
-- La distancia se calcula en el navegador del comprador: su ubicación nunca llega al servidor.
ALTER TABLE agencias_sedes ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE agencias_sedes ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE agencias_sedes DROP CONSTRAINT IF EXISTS agencias_sedes_ubicacion_check;
-- Las dos o ninguna, y dentro del Perú.
ALTER TABLE agencias_sedes ADD CONSTRAINT agencias_sedes_ubicacion_check CHECK (
    (lat IS NULL AND lng IS NULL) OR (lat BETWEEN -18.5 AND 0.1 AND lng BETWEEN -81.5 AND -68.5)
);
