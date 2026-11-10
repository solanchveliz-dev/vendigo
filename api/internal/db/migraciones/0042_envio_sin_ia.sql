-- Registro de envíos sin IA: la tienda escribe a mano la empresa de transporte, el número de guía y la clave de
-- recojo, y puede adjuntar la boleta (foto o PDF) solo como evidencia. Se agrega un enlace de rastreo opcional
-- que la tienda copia de la agencia, para que el comprador siga su paquete.
-- El CHECK de uso_ia conserva 'leer_boleta' a propósito: guarda el historial de usos anteriores.
ALTER TABLE envios ADD COLUMN IF NOT EXISTS enlace_rastreo TEXT NOT NULL DEFAULT '';
