-- Pago solo digital (Yape o Plin directo a la tienda) y la tienda decide, por forma de entrega,
-- si el cliente paga completo antes, un adelanto antes y el resto al recibir, o todo al recibir.
-- El costo del motorizado se le paga a él aparte: no entra al total del pedido.

-- 1. Opciones de la tienda
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS recojo_pago TEXT NOT NULL DEFAULT 'completo'
    CHECK (recojo_pago IN ('completo', 'adelanto', 'al_recibir'));
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS motorizado_pago TEXT NOT NULL DEFAULT 'completo'
    CHECK (motorizado_pago IN ('completo', 'adelanto', 'al_recibir'));
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS motorizado_adelanto_pct INT NOT NULL DEFAULT 0
    CHECK (motorizado_adelanto_pct IN (0, 20, 30, 50));

-- El adelanto de recojo que ya existía pasa a ser la opción "adelanto".
UPDATE tiendas SET recojo_pago = 'adelanto' WHERE adelanto_pct > 0 AND recojo_pago = 'completo';

-- 2. Sin efectivo: los pedidos nuevos solo aceptan Yape o Plin (los antiguos se conservan).
UPDATE tiendas SET acepta_efectivo = false WHERE acepta_efectivo;

-- 3. Pago con adelanto
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS adelanto_centimos INT NOT NULL DEFAULT 0 CHECK (adelanto_centimos >= 0);
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_momento_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_momento_check CHECK (momento IN ('antes', 'adelanto', 'al_recibir'));
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_estado_check;
ALTER TABLE pagos ADD CONSTRAINT pagos_estado_check CHECK (estado IN (
    'pendiente', 'comprobante_enviado', 'paga_al_recibir',
    'adelanto_informado',   -- la tienda recibió el adelanto; el resto se paga al recibir
    'informado_tienda', 'no_recibido', 'confirmado', 'rechazado', 'reembolsado', 'de_prueba'));
ALTER TABLE pagos ADD CONSTRAINT pagos_adelanto_coherente CHECK ((momento = 'adelanto') = (adelanto_centimos > 0));
