-- Libro de Reclamaciones virtual (Ley 29571, D.S. 011-2011-PCM modificado por D.S. 101-2022-PCM).
-- Cada hoja tiene número correlativo y se responde en máximo 15 días hábiles.
CREATE SEQUENCE IF NOT EXISTS hojas_reclamacion_seq START 1;
CREATE TABLE IF NOT EXISTS hojas_reclamacion (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero           BIGINT NOT NULL UNIQUE DEFAULT nextval('hojas_reclamacion_seq'),
    -- Consumidor
    nombre           TEXT NOT NULL,
    documento_tipo   TEXT NOT NULL CHECK (documento_tipo IN ('DNI', 'CE', 'Pasaporte')),
    documento        TEXT NOT NULL,
    domicilio        TEXT NOT NULL,
    telefono         TEXT NOT NULL,
    email            TEXT NOT NULL,
    apoderado        TEXT NOT NULL DEFAULT '',   -- padre o madre si es menor de edad
    -- Bien contratado
    bien_tipo        TEXT NOT NULL CHECK (bien_tipo IN ('producto', 'servicio')),
    monto_centimos   INT,
    descripcion_bien TEXT NOT NULL,
    pedido_codigo    TEXT NOT NULL DEFAULT '',
    tienda           TEXT NOT NULL DEFAULT '',
    -- Reclamo o queja
    tipo             TEXT NOT NULL CHECK (tipo IN ('reclamo', 'queja')),
    detalle          TEXT NOT NULL,
    pedido_consumidor TEXT NOT NULL,
    -- Respuesta del proveedor
    respuesta        TEXT NOT NULL DEFAULT '',
    respondida_en    TIMESTAMPTZ,
    respondida_por   UUID REFERENCES usuarios(id),
    vence_en         TIMESTAMPTZ NOT NULL,
    ip               TEXT NOT NULL DEFAULT '',
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Datos del proveedor que salen en cada hoja (se completan en Configuración).
INSERT INTO ajustes_plataforma (clave, valor) VALUES ('razon_social', ''), ('ruc', ''), ('direccion_fiscal', '') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION aviso_admin_libro() RETURNS trigger AS $$
BEGIN
    PERFORM avisar_admins('Libro de reclamaciones: hoja N.° ' || lpad(NEW.numero::text, 6, '0'),
        initcap(NEW.tipo) || ' de ' || NEW.nombre || '. Responder antes del ' || to_char(NEW.vence_en AT TIME ZONE 'America/Lima', 'DD/MM/YYYY') || '.',
        '/admin/libro', 'incidencias');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS aviso_admin ON hojas_reclamacion;
CREATE TRIGGER aviso_admin AFTER INSERT ON hojas_reclamacion FOR EACH ROW EXECUTE FUNCTION aviso_admin_libro();
