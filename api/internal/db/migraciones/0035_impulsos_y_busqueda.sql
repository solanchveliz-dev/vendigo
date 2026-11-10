-- Se retira la "Protección VendiGo" como suscripción de la tienda: el ingreso extra es impulsar productos
-- (como en Marketplace). Lo cobrado por impulsos alimenta el fondo de emergencia de VendiGo.
ALTER TABLE tiendas DROP COLUMN IF EXISTS proteccion_hasta;
ALTER TABLE pedidos DROP COLUMN IF EXISTS protegido;
DELETE FROM ajustes_plataforma WHERE clave = 'proteccion_precio_centimos';

-- Cada impulso pagado: cuánto dura y cuántas veces se mostró y se visitó (datos reales para la tienda).
CREATE TABLE IF NOT EXISTS impulsos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id  UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    tienda_id    UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    pago_plan_id UUID REFERENCES pagos_plan(id) ON DELETE SET NULL,
    dias         INT NOT NULL CHECK (dias > 0),
    inicio       TIMESTAMPTZ NOT NULL DEFAULT now(),
    fin          TIMESTAMPTZ NOT NULL,
    impresiones  INT NOT NULL DEFAULT 0, -- veces que salió en búsquedas y destacados
    visitas      INT NOT NULL DEFAULT 0  -- veces que abrieron el producto
);
CREATE INDEX IF NOT EXISTS impulsos_producto_idx ON impulsos (producto_id, fin DESC);

-- La tienda escribe el n.° de operación de su Yape a VendiGo al pedir el impulso (lo revisa el admin).
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS referencia_tienda TEXT NOT NULL DEFAULT '';

-- Búsqueda de productos en VendiGo.
CREATE INDEX IF NOT EXISTS productos_activos_idx ON productos (tienda_id) WHERE activo AND NOT eliminado;
