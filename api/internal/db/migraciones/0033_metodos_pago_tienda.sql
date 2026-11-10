-- La tienda elige sus métodos de pago: Yape y Plin (cada uno con su QR), tarjeta con su propio
-- link (indicando qué tarjetas acepta) y transferencia bancaria. Todo va directo a la tienda.
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS plin_qr_key TEXT;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS tarjeta_marcas TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS transf_banco TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS transf_cuenta TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS transf_cci TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS transf_titular TEXT NOT NULL DEFAULT '';

-- Quien ya tenía link de tarjeta: por defecto Visa y Mastercard (lo puede cambiar).
UPDATE tiendas SET tarjeta_marcas = '{visa,mastercard}' WHERE tarjeta_link <> '' AND tarjeta_marcas = '{}';

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_metodo_pago_check
    CHECK (metodo_pago IN ('yape_directo', 'plin_directo', 'tarjeta_tienda', 'transferencia_tienda',
                           'efectivo', 'yape', 'tarjeta', 'pagoefectivo', 'al_recibir'));
