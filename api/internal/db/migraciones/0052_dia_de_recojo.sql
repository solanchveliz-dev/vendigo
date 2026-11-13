-- Día en que el cliente dice que pasará a recoger su pedido (solo en "Recojo en tienda"). Funciona como una reserva:
-- la tienda sabe qué día tener listo el pedido.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS dia_recojo DATE;
