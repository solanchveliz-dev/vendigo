-- Todo lo que las tiendas le pagan a VendiGo (planes, ventas extra, impulsos y créditos de IA) se paga solo con
-- Culqi y se activa en cuanto Culqi aprueba el cobro. El admin ya no confirma pagos manuales.
-- Esta migración no borra nada: solo cierra los avisos manuales antiguos que ya nadie podrá confirmar.

-- Avisos manuales de "ya pagué" (n.° de operación de Yape, Plin o transferencia) que seguían esperando al admin.
-- Los cobros de Culqi (referencia chr_…) no se tocan: el admin todavía puede activarlos.
UPDATE pagos_plan
SET estado = 'rechazado',
    motivo_rechazo = 'VendiGo ahora cobra solo con Culqi. Vuelve a pedirlo y paga con tarjeta o Yape: se activa al instante.'
WHERE estado = 'pendiente'
  AND referencia_tienda <> ''
  AND referencia_tienda NOT LIKE 'chr\_%';
