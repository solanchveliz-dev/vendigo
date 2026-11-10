-- 1. Verificación en dos partes:
--    · identidad (DNI o carné de extranjería, con selfie): obligatoria. Sin ella la tienda no se muestra a los compradores.
--    · negocio (RUC con su ficha RUC): opcional. Da la insignia "Negocio con RUC verificado".
--    Las dos las aprueba un administrador.
ALTER TABLE verificaciones ADD COLUMN IF NOT EXISTS clase TEXT NOT NULL DEFAULT 'identidad'
    CHECK (clase IN ('identidad', 'negocio'));
UPDATE verificaciones SET clase = 'negocio' WHERE tipo_documento = 'ruc';
ALTER TABLE verificaciones ALTER COLUMN selfie_key DROP NOT NULL; -- la ficha RUC no lleva selfie
CREATE INDEX IF NOT EXISTS verificaciones_clase_idx ON verificaciones (tienda_id, clase, estado);

-- 2. Una sola regla para toda la API (búsqueda, tienda pública, productos, compra y pedidos).
CREATE OR REPLACE FUNCTION tienda_identidad_verificada(p_tienda UUID) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM verificaciones v WHERE v.tienda_id = p_tienda AND v.clase = 'identidad' AND v.estado = 'aprobada')
$$;

CREATE OR REPLACE FUNCTION tienda_ruc_verificado(p_tienda UUID) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM verificaciones v WHERE v.tienda_id = p_tienda AND v.clase = 'negocio' AND v.estado = 'aprobada')
$$;

-- Suspensión automática por reclamo: si un comprador que ya pagó reporta "No me llegó", la tienda deja de recibir
-- pedidos y de aparecer en las búsquedas mientras VendiGo revisa las pruebas. Se levanta sola cuando el reclamo se
-- resuelve a favor de la tienda, o cuando la tienda devuelve el dinero e informa la devolución.
-- Devuelve el id del pedido que la bloquea (NULL si no hay ninguno).
CREATE OR REPLACE FUNCTION tienda_reclamo_bloqueante(p_tienda UUID) RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT pe.id::text
    FROM reclamos c JOIN pedidos pe ON pe.id = c.pedido_id
    WHERE pe.tienda_id = p_tienda AND c.motivo = 'no_llego'
      AND (c.estado IN ('abierto', 'en_revision')
           OR (c.estado = 'a_favor_comprador'
               AND EXISTS (SELECT 1 FROM devoluciones d WHERE d.pedido_id = pe.id AND d.estado = 'pendiente_tienda')))
    ORDER BY c.creado_en
    LIMIT 1
$$;
