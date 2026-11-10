-- Créditos de IA extra: compra opcional que la tienda le paga a VendiGo solo con Culqi.
-- Los créditos se entregan recién cuando Culqi aprueba el cobro (antes se entregaban al pedirlos y el pago
-- quedaba "pendiente" registrado como si fuera un plan). Esta migración solo agrega un tipo y ordena datos.

-- 1. Nuevo tipo de pago a VendiGo.
ALTER TABLE pagos_plan DROP CONSTRAINT IF EXISTS pagos_plan_tipo_check;
ALTER TABLE pagos_plan ADD CONSTRAINT pagos_plan_tipo_check
    CHECK (tipo IN ('plan', 'ventas_extra', 'destacado', 'proteccion', 'creditos_ia'));

-- 2. Las compras de créditos antiguas estaban guardadas como tipo "plan" sin plan.
UPDATE pagos_plan SET tipo = 'creditos_ia'
WHERE tipo = 'plan' AND plan_id IS NULL AND concepto LIKE '+% créditos de IA';

-- 3. Esas compras antiguas ya entregaron sus créditos sin cobro real (datos de prueba): se marcan así
--    para que el admin no las vea "por confirmar" ni las confirme (eso volvería a sumar créditos).
UPDATE pagos_plan SET estado = 'de_prueba'
WHERE tipo = 'creditos_ia' AND estado = 'pendiente';
