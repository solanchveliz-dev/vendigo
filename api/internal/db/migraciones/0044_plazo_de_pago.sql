-- Plazo para pagar: un pedido sin captura de pago (pago "pendiente") se cancela solo al vencer el plazo y el stock
-- vuelve a la tienda. Venta normal: 24 h. El Modo live usará plazos de minutos con la misma columna.
-- Si el comprador ya subió su captura, el pedido NUNCA se cancela solo: lo decide la tienda o un reclamo.
-- Pagar al recibir y los pedidos de prueba no tienen plazo.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pago_vence_en TIMESTAMPTZ;
-- Un pedido vencido sin pago no cuenta en el cupo de ventas del plan.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS vencido_sin_pago BOOLEAN NOT NULL DEFAULT false;

-- Pedidos abiertos que ya esperaban pago: reciben 24 h desde hoy (no se cancelan de golpe al migrar).
UPDATE pedidos p SET pago_vence_en = now() + interval '24 hours'
FROM pagos g
WHERE g.pedido_id = p.id AND g.estado = 'pendiente' AND p.pago_vence_en IS NULL
  AND p.estado IN ('por_aceptar', 'preparando', 'listo_recojo');

CREATE INDEX IF NOT EXISTS pedidos_pago_vence_idx ON pedidos (pago_vence_en) WHERE pago_vence_en IS NOT NULL;
