-- Sedes de agencias de envío que mantiene el admin (las que verá el comprador al elegir dónde recoger).
CREATE TABLE IF NOT EXISTS agencias_sedes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agencia    TEXT NOT NULL,
    ciudad     TEXT NOT NULL,
    nombre     TEXT NOT NULL,
    direccion  TEXT NOT NULL,
    activa     BOOLEAN NOT NULL DEFAULT true,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agencia, nombre)
);
INSERT INTO ajustes_plataforma (clave, valor) VALUES ('correo_soporte', 'ayuda@vendigo.pe') ON CONFLICT DO NOTHING;

-- Avisos para el equipo admin cuando pasa algo que debe revisar. Se generan en la base de datos,
-- así ningún módulo puede olvidarse de avisar.
CREATE OR REPLACE FUNCTION avisar_admins(p_titulo TEXT, p_cuerpo TEXT, p_enlace TEXT, p_tipo TEXT) RETURNS void AS $$
    INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo)
    SELECT id, p_titulo, p_cuerpo, p_enlace, p_tipo FROM usuarios WHERE rol='admin' AND activo;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION aviso_admin_evento() RETURNS trigger AS $$
DECLARE t TEXT;
BEGIN
    IF TG_TABLE_NAME = 'tiendas' THEN
        PERFORM avisar_admins(NEW.nombre || ' espera revisión', 'Tienda nueva pendiente de aprobación.', '/admin/tiendas/' || NEW.id, 'tiendas');
    ELSIF TG_TABLE_NAME = 'verificaciones' AND NEW.estado = 'pendiente' THEN
        SELECT nombre INTO t FROM tiendas WHERE id = NEW.tienda_id;
        PERFORM avisar_admins('Identidad por revisar', COALESCE(t, 'Una tienda') || ' envió su DNI para verificar.', '/admin/vendedores', 'tiendas');
    ELSIF TG_TABLE_NAME = 'retiros' THEN
        SELECT nombre INTO t FROM tiendas WHERE id = NEW.tienda_id;
        PERFORM avisar_admins('Retiro por pagar', COALESCE(t, 'Una tienda') || ' pidió retirar S/ ' || to_char(NEW.monto_centimos / 100.0, 'FM999999990.00') || '.', '/admin/retiros', 'pagos');
    ELSIF TG_TABLE_NAME = 'reclamos' THEN
        SELECT p.codigo || ' · ' || ti.nombre INTO t FROM pedidos p JOIN tiendas ti ON ti.id = p.tienda_id WHERE p.id = NEW.pedido_id;
        PERFORM avisar_admins('Nuevo reclamo', 'Reclamo en el pedido ' || COALESCE(t, '') || '.', '/admin/reclamos', 'incidencias');
    ELSIF TG_TABLE_NAME = 'incidencias' THEN
        PERFORM avisar_admins('Nueva incidencia INC-' || NEW.numero, NEW.titulo || ' (prioridad ' || NEW.prioridad || ').', '/admin/incidencias/INC-' || NEW.numero, 'incidencias');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS aviso_admin ON tiendas;
CREATE TRIGGER aviso_admin AFTER INSERT ON tiendas FOR EACH ROW EXECUTE FUNCTION aviso_admin_evento();
DROP TRIGGER IF EXISTS aviso_admin ON verificaciones;
CREATE TRIGGER aviso_admin AFTER INSERT ON verificaciones FOR EACH ROW EXECUTE FUNCTION aviso_admin_evento();
DROP TRIGGER IF EXISTS aviso_admin ON retiros;
CREATE TRIGGER aviso_admin AFTER INSERT ON retiros FOR EACH ROW EXECUTE FUNCTION aviso_admin_evento();
DROP TRIGGER IF EXISTS aviso_admin ON reclamos;
CREATE TRIGGER aviso_admin AFTER INSERT ON reclamos FOR EACH ROW EXECUTE FUNCTION aviso_admin_evento();
DROP TRIGGER IF EXISTS aviso_admin ON incidencias;
CREATE TRIGGER aviso_admin AFTER INSERT ON incidencias FOR EACH ROW EXECUTE FUNCTION aviso_admin_evento();

-- Los avisos de seguridad del admin (inicios de sesión, códigos de respaldo) van en su propio filtro.
UPDATE notificaciones n SET tipo='seguridad', enlace='/admin/seguridad'
FROM usuarios u WHERE u.id=n.usuario_id AND u.rol='admin' AND n.tipo='pagos' AND n.enlace='/admin';
