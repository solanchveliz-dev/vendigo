-- Perfil comprador, fase 2: favoritos, direcciones, valoraciones y avisos de sus pedidos.

-- Tiendas que sigue y productos que guardó.
CREATE TABLE IF NOT EXISTS favoritos_tiendas (
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tienda_id  UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, tienda_id)
);
CREATE INDEX IF NOT EXISTS favoritos_tiendas_tienda_idx ON favoritos_tiendas (tienda_id);

CREATE TABLE IF NOT EXISTS favoritos_productos (
    usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, producto_id)
);

-- Direcciones guardadas para el delivery con motorizado (se llenan solas en la compra).
CREATE TABLE IF NOT EXISTS direcciones (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    etiqueta   TEXT NOT NULL,
    direccion  TEXT NOT NULL,
    distrito   TEXT NOT NULL DEFAULT '',
    ciudad     TEXT NOT NULL DEFAULT '',
    referencia TEXT NOT NULL DEFAULT '',
    principal  BOOLEAN NOT NULL DEFAULT false,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS direcciones_usuario_idx ON direcciones (usuario_id);
CREATE UNIQUE INDEX IF NOT EXISTS direcciones_principal_idx ON direcciones (usuario_id) WHERE principal;

-- Valoración de un pedido entregado: una por pedido, solo de quien lo compró.
CREATE TABLE IF NOT EXISTS valoraciones (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id        UUID NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
    usuario_id       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    tienda_id        UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    estrellas_tienda INT NOT NULL CHECK (estrellas_tienda BETWEEN 1 AND 5),
    comentario       TEXT NOT NULL DEFAULT '' CHECK (length(comentario) <= 500),
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS valoraciones_tienda_idx ON valoraciones (tienda_id, creado_en DESC);

CREATE TABLE IF NOT EXISTS valoraciones_productos (
    valoracion_id UUID NOT NULL REFERENCES valoraciones(id) ON DELETE CASCADE,
    producto_id   UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    estrellas     INT NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
    PRIMARY KEY (valoracion_id, producto_id)
);
CREATE INDEX IF NOT EXISTS valoraciones_productos_idx ON valoraciones_productos (producto_id);

-- Avisos al comprador con cuenta cuando su pedido o su pago cambian (además del SMS que ya existe).
CREATE OR REPLACE FUNCTION avisar_comprador() RETURNS trigger AS $$
DECLARE
    p RECORD;
    titulo TEXT;
    cuerpo TEXT;
    enlace TEXT;
BEGIN
    IF TG_TABLE_NAME = 'pedidos' THEN
        IF NEW.estado = OLD.estado OR NEW.comprador_id IS NULL THEN RETURN NEW; END IF;
        SELECT NEW.comprador_id AS comprador_id, NEW.codigo AS codigo, NEW.token_seguimiento AS token, t.nombre AS tienda
            INTO p FROM tiendas t WHERE t.id = NEW.tienda_id;
        titulo := CASE NEW.estado
            WHEN 'preparando'   THEN 'Tu pedido ' || p.codigo || ' fue aceptado'
            WHEN 'listo_recojo' THEN 'Tu pedido ' || p.codigo || ' está listo para recoger'
            WHEN 'enviado'      THEN 'Tu pedido ' || p.codigo || ' va en camino'
            WHEN 'entregado'    THEN 'Recibiste tu pedido ' || p.codigo
            WHEN 'rechazado'    THEN 'La tienda no pudo aceptar tu pedido ' || p.codigo
            WHEN 'cancelado'    THEN 'Se canceló tu pedido ' || p.codigo
            ELSE NULL END;
        cuerpo := CASE NEW.estado
            WHEN 'entregado' THEN '¿Qué tal tu compra en ' || p.tienda || '? Valórala para ayudar a otros compradores.'
            ELSE p.tienda || ' actualizó tu pedido. Toca para ver el detalle.' END;
        enlace := CASE WHEN NEW.estado = 'entregado' THEN '/mi-cuenta/valorar/' || p.codigo ELSE '/seguimiento/' || COALESCE(p.token, '') END;
    ELSE
        IF NEW.estado = OLD.estado THEN RETURN NEW; END IF;
        SELECT d.comprador_id, d.codigo, d.token_seguimiento AS token, t.nombre AS tienda
            INTO p FROM pedidos d JOIN tiendas t ON t.id = d.tienda_id WHERE d.id = NEW.pedido_id;
        IF p.comprador_id IS NULL THEN RETURN NEW; END IF;
        titulo := CASE NEW.estado
            WHEN 'informado_tienda' THEN p.tienda || ' recibió tu pago del pedido ' || p.codigo
            WHEN 'confirmado'       THEN 'Pago confirmado del pedido ' || p.codigo
            WHEN 'no_recibido'      THEN p.tienda || ' no recibió tu pago del pedido ' || p.codigo
            WHEN 'rechazado'        THEN 'Tu pago del pedido ' || p.codigo || ' fue rechazado'
            ELSE NULL END;
        cuerpo := 'Toca para ver el detalle de tu pago.';
        enlace := '/seguimiento/' || COALESCE(p.token, '');
    END IF;
    IF titulo IS NOT NULL THEN
        INSERT INTO notificaciones (usuario_id, titulo, cuerpo, enlace, tipo)
        VALUES (p.comprador_id, titulo, cuerpo, enlace, 'pedidos');
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS aviso_comprador ON pedidos;
CREATE TRIGGER aviso_comprador AFTER UPDATE OF estado ON pedidos FOR EACH ROW EXECUTE FUNCTION avisar_comprador();
DROP TRIGGER IF EXISTS aviso_comprador ON pagos;
CREATE TRIGGER aviso_comprador AFTER UPDATE OF estado ON pagos FOR EACH ROW EXECUTE FUNCTION avisar_comprador();
