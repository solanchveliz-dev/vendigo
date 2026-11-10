-- Seguimiento del comprador sin cuenta: cada pedido tiene un enlace secreto que le llega por SMS.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS token_seguimiento TEXT;
UPDATE pedidos SET token_seguimiento = replace(gen_random_uuid()::text, '-', '') WHERE token_seguimiento IS NULL;
ALTER TABLE pedidos ALTER COLUMN token_seguimiento SET DEFAULT replace(gen_random_uuid()::text, '-', '');
ALTER TABLE pedidos ALTER COLUMN token_seguimiento SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_token_idx ON pedidos (token_seguimiento);

-- Código por SMS para verificar el celular del comprador antes de crear el pedido.
ALTER TABLE codigos_otp DROP CONSTRAINT IF EXISTS codigos_otp_proposito_check;
ALTER TABLE codigos_otp ADD CONSTRAINT codigos_otp_proposito_check CHECK (proposito IN ('registro', 'recuperar', 'confirmar', 'compra'));

-- Pagos de planes: VendiGo es quien vende el plan, así que cobra en su propia cuenta.
-- Mientras no haya pasarela, la tienda paga por Yape a VendiGo y el admin registra el pago recibido.
INSERT INTO ajustes_plataforma (clave, valor) VALUES ('planes_yape', ''), ('planes_titular', '') ON CONFLICT DO NOTHING;
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES planes(id);
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'plan' CHECK (tipo IN ('plan', 'ventas_extra'));
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS confirmado_por UUID REFERENCES usuarios(id);
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS confirmado_en TIMESTAMPTZ;
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT NOT NULL DEFAULT '';
