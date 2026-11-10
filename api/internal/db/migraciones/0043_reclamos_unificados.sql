-- Reclamos unificados: un solo módulo para pagos no reconocidos, pedidos no entregados y devoluciones.
--
-- 1. Nuevo motivo "pago_no_reconocido": el comprador pagó y la tienda dice que no le llegó el pago
--    (o no revisa su comprobante en 48 h).
ALTER TABLE reclamos DROP CONSTRAINT IF EXISTS reclamos_motivo_check;
ALTER TABLE reclamos ADD CONSTRAINT reclamos_motivo_check
    CHECK (motivo IN ('no_llego', 'danado', 'distinto', 'incompleto', 'otro', 'pago_no_reconocido'));

-- 2. Pausa por reclamo, ya no al instante. Un solo reclamo no detiene la tienda: solo deja de recibir pedidos
--    (y de aparecer en búsquedas) si NO RESPONDE un reclamo en 48 h, y vuelve sola en cuanto responde.
--    También sigue pausada si VendiGo, después de revisar, le dio la razón al comprador y la tienda aún no informa
--    la devolución. Cualquier otra suspensión la decide el administrador.
--    Devuelve el id del pedido que la pausa (NULL si no hay ninguno).
CREATE OR REPLACE FUNCTION tienda_reclamo_bloqueante(p_tienda UUID) RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT pe.id::text
    FROM reclamos c JOIN pedidos pe ON pe.id = c.pedido_id
    WHERE pe.tienda_id = p_tienda
      AND ((c.estado IN ('abierto', 'en_revision') AND c.respondido_en IS NULL AND c.creado_en < now() - interval '48 hours')
           OR (c.estado = 'a_favor_comprador'
               AND EXISTS (SELECT 1 FROM devoluciones d WHERE d.pedido_id = pe.id AND d.estado = 'pendiente_tienda')))
    ORDER BY c.creado_en
    LIMIT 1
$$;
