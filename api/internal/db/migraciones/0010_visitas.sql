-- Visitas a la tienda pública y a cada producto, agrupadas por día.
-- producto_id NULL = visita a la página de la tienda.
CREATE TABLE IF NOT EXISTS visitas (
    tienda_id   UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id) ON DELETE CASCADE,
    dia         DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')::date,
    cantidad    INT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS visitas_dia_idx
    ON visitas (tienda_id, (COALESCE(producto_id, '00000000-0000-0000-0000-000000000000'::uuid)), dia);
