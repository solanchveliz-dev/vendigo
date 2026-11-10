-- Cuando VendiGo resuelve un reclamo a favor de la tienda, el pedido queda entregado.
-- Antes solo se escribía el aviso: si el reclamo se abrió con el pedido "enviado", el pedido se quedaba
-- en "enviado" para siempre (la confirmación automática de 7 días no toca pedidos con reclamo).
-- Esta migración solo agrega un valor permitido y repara datos; no quita nada.

-- 1. Nuevo valor: entrega dada por buena al resolver un reclamo.
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_confirmado_por_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_confirmado_por_check
    CHECK (confirmado_por IN ('comprador', 'automatico', 'vendedor', 'vendigo'));

-- 2. Pedidos que quedaron trabados en "enviado" con el reclamo ya resuelto a favor de la tienda.
WITH reparados AS (
    UPDATE pedidos p SET estado = 'entregado', entregado_en = COALESCE(c.resuelto_en, now()), confirmado_por = 'vendigo'
    FROM reclamos c
    WHERE c.pedido_id = p.id AND c.estado = 'a_favor_vendedor' AND p.estado = 'enviado'
    RETURNING p.id
)
INSERT INTO pedido_eventos (pedido_id, estado, detalle)
SELECT id, 'entregado', 'Se dio por entregado: VendiGo resolvió el reclamo a favor de la tienda.' FROM reparados;

-- 3. Avisos antiguos de "Retiro por pagar" apuntaban a una pantalla que ya no existe.
UPDATE notificaciones SET enlace = '/admin/pagos' WHERE enlace = '/admin/retiros';
