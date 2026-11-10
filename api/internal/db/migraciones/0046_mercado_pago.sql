-- Mercado Pago opcional por tienda (Split de Pagos 1:1). Cada tienda vincula SU cuenta con OAuth: el comprador
-- paga en el checkout de Mercado Pago y el dinero va directo a la cuenta de la tienda. VendiGo no recibe el dinero
-- (comisión del marketplace en cero) y confirma el pago solo cuando lo consulta en la API de Mercado Pago.
CREATE TABLE IF NOT EXISTS tiendas_mercadopago (
    tienda_id       UUID PRIMARY KEY REFERENCES tiendas(id) ON DELETE CASCADE,
    mp_usuario_id   TEXT NOT NULL,
    access_cifrado  TEXT NOT NULL,   -- tokens cifrados con la misma llave AES-256-GCM del DNI
    refresh_cifrado TEXT NOT NULL,
    vence_en        TIMESTAMPTZ NOT NULL,
    vinculado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "state" del OAuth: une la autorización con la tienda que la pidió y evita que alguien inyecte un código ajeno.
CREATE TABLE IF NOT EXISTS mercadopago_estados (
    estado    TEXT PRIMARY KEY,
    tienda_id UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_metodo_pago_check
    CHECK (metodo_pago IN ('yape_directo', 'plin_directo', 'tarjeta_tienda', 'transferencia_tienda', 'mercadopago',
                           'efectivo', 'yape', 'tarjeta', 'pagoefectivo', 'al_recibir'));
