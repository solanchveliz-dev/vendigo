-- Fondo de emergencia: un porcentaje de TODO lo que cobra VendiGo (planes, ventas extra, impulsos y créditos de IA)
-- más un aporte inicial opcional. Es un solo fondo común para todas las tiendas.
-- Cubre al comprador hasta el tope por pedido cuando la tienda no le devuelve a tiempo; la tienda queda suspendida
-- y ya no se le pide "reponer": el admin decide si la reactiva tras revisar el caso. Solo agrega ajustes.
INSERT INTO ajustes_plataforma (clave, valor) VALUES
    ('fondo_porcentaje', '4'),
    ('fondo_aporte_inicial_centimos', '0')
ON CONFLICT DO NOTHING;
