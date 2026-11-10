-- Pago con tarjeta opcional: la tienda pega su propio link de pago (Mercado Pago, Izipay, Niubiz, etc.).
-- El dinero va directo a la cuenta de la tienda; VendiGo solo muestra el link y da seguimiento.
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS tarjeta_link TEXT NOT NULL DEFAULT '';

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_metodo_pago_check
    CHECK (metodo_pago IN ('yape_directo', 'plin_directo', 'tarjeta_tienda', 'efectivo', 'yape', 'tarjeta', 'pagoefectivo', 'al_recibir'));
