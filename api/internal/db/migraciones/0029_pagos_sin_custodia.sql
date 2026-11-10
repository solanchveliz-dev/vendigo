-- VendiGo no recibe, retiene ni administra el dinero de las ventas: cada tienda cobra directo
-- (Yape/Plin a su número o efectivo al recibir) y VendiGo solo registra el estado del pago y da seguimiento.
-- "Confirmado" y "Reembolsado" quedan reservados para cuando un proveedor de pagos lo valide.
-- Esta migración SOLO agrega; las columnas y tablas antiguas se retiran en la última etapa.

-- 1. Datos para que el comprador pague directo a la tienda
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS yape_numero     TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS plin_numero     TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS pago_titular    TEXT NOT NULL DEFAULT '';  -- nombre que ve el comprador al yapear
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS pago_qr_key     TEXT;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS acepta_efectivo BOOLEAN NOT NULL DEFAULT true;

-- 2. Nuevos métodos de pago directo a la tienda (los de proveedor quedan para una integración futura)
ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_metodo_pago_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_metodo_pago_check
    CHECK (metodo_pago IN ('yape_directo', 'plin_directo', 'efectivo', 'yape', 'tarjeta', 'pagoefectivo', 'al_recibir'));

-- 3. Pago de cada pedido, separado del estado de la entrega
CREATE TABLE IF NOT EXISTS pagos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id       UUID NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
    -- tienda: lo informa la vendedora · proveedor: lo valida una pasarela · prueba: datos de prueba
    origen          TEXT NOT NULL CHECK (origen IN ('tienda', 'proveedor', 'prueba')),
    metodo          TEXT NOT NULL,
    momento         TEXT NOT NULL CHECK (momento IN ('antes', 'al_recibir')),
    estado          TEXT NOT NULL CHECK (estado IN (
                        'pendiente',            -- espera que el comprador pague
                        'comprobante_enviado',  -- el comprador subió su captura
                        'paga_al_recibir',      -- pagará al recibir (motorizado o recojo)
                        'informado_tienda',     -- la tienda dice que recibió el pago
                        'no_recibido',          -- la tienda dice que no le llegó
                        'confirmado',           -- validado por un proveedor de pagos
                        'rechazado',            -- rechazado por un proveedor de pagos
                        'reembolsado',          -- devolución validada por un proveedor
                        'de_prueba')),          -- pedido creado con datos de prueba
    monto_centimos  INT NOT NULL CHECK (monto_centimos >= 0),
    moneda          TEXT NOT NULL DEFAULT 'PEN',
    comprobante_key TEXT,
    referencia      TEXT NOT NULL DEFAULT '',   -- n.° de operación de Yape o id del proveedor
    comision_reportada_centimos INT,            -- solo si el proveedor la informa (VendiGo cobra 0 %)
    informado_por   UUID REFERENCES usuarios(id),
    informado_en    TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Nadie puede marcar un pago como confirmado o reembolsado sin un proveedor real.
    CONSTRAINT pagos_confirmado_por_proveedor CHECK (estado NOT IN ('confirmado', 'rechazado', 'reembolsado') OR origen = 'proveedor'),
    CONSTRAINT pagos_prueba_coherente CHECK ((estado = 'de_prueba') = (origen = 'prueba'))
);
CREATE INDEX IF NOT EXISTS pagos_estado_idx ON pagos (estado);

-- Historial de cada cambio del pago (solo se agregan filas)
CREATE TABLE IF NOT EXISTS pago_eventos (
    id         BIGSERIAL PRIMARY KEY,
    pago_id    UUID NOT NULL REFERENCES pagos(id) ON DELETE CASCADE,
    estado     TEXT NOT NULL,
    detalle    TEXT NOT NULL DEFAULT '',
    usuario_id UUID REFERENCES usuarios(id),
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pago_eventos_idx ON pago_eventos (pago_id, creado_en);

-- 4. Devoluciones: las hace la tienda (o un proveedor); VendiGo registra y da seguimiento
CREATE TABLE IF NOT EXISTS devoluciones (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id      UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    origen         TEXT NOT NULL CHECK (origen IN ('cancelacion', 'reclamo')),
    monto_centimos INT NOT NULL CHECK (monto_centimos >= 0),
    estado         TEXT NOT NULL CHECK (estado IN ('pendiente_tienda', 'informada_tienda', 'confirmada_proveedor', 'de_prueba')),
    evidencia_key  TEXT,
    nota           TEXT NOT NULL DEFAULT '',
    informada_en   TIMESTAMPTZ,
    confirmada_en  TIMESTAMPTZ,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS devoluciones_pedido_idx ON devoluciones (pedido_id, origen);

-- 5. Pagos de planes (dinero de VendiGo, aparte de las ventas de las tiendas)
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'de_prueba';
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS proveedor TEXT NOT NULL DEFAULT '';
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS referencia TEXT NOT NULL DEFAULT '';
ALTER TABLE pagos_plan ADD COLUMN IF NOT EXISTS comision_reportada_centimos INT;
ALTER TABLE pagos_plan DROP CONSTRAINT IF EXISTS pagos_plan_estado_check;
ALTER TABLE pagos_plan ADD CONSTRAINT pagos_plan_estado_check CHECK (estado IN ('de_prueba', 'pendiente', 'confirmado', 'rechazado'));
ALTER TABLE pagos_plan ALTER COLUMN estado SET DEFAULT 'pendiente';

-- 6. Archivo histórico de solo lectura (saldos, liberaciones y retiros del modelo anterior)
CREATE TABLE IF NOT EXISTS movimientos_archivo (LIKE movimientos INCLUDING ALL);
INSERT INTO movimientos_archivo SELECT * FROM movimientos ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS retiros_archivo (LIKE retiros INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE retiros_archivo ADD PRIMARY KEY (id);
INSERT INTO retiros_archivo SELECT * FROM retiros ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS pedidos_finanzas_archivo (
    pedido_id               UUID PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
    liberar_en              TIMESTAMPTZ,
    liberado                BOOLEAN NOT NULL,
    retiro_id               UUID,
    comision_estimada_centimos INT NOT NULL,
    archivado_en            TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO pedidos_finanzas_archivo (pedido_id, liberar_en, liberado, retiro_id, comision_estimada_centimos)
    SELECT id, liberar_en, liberado, retiro_id, comision_pasarela_centimos FROM pedidos ON CONFLICT DO NOTHING;

-- El archivo solo se puede leer. (La sincronización final de la última etapa usa el ajuste vendigo.archivar.)
CREATE OR REPLACE FUNCTION archivo_solo_lectura() RETURNS trigger AS $$
BEGIN
    IF current_setting('vendigo.archivar', true) = 'si' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    RAISE EXCEPTION 'La tabla % es un archivo histórico de solo lectura', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS solo_lectura ON movimientos_archivo;
CREATE TRIGGER solo_lectura BEFORE INSERT OR UPDATE OR DELETE ON movimientos_archivo FOR EACH ROW EXECUTE FUNCTION archivo_solo_lectura();
DROP TRIGGER IF EXISTS solo_lectura ON retiros_archivo;
CREATE TRIGGER solo_lectura BEFORE INSERT OR UPDATE OR DELETE ON retiros_archivo FOR EACH ROW EXECUTE FUNCTION archivo_solo_lectura();
DROP TRIGGER IF EXISTS solo_lectura ON pedidos_finanzas_archivo;
CREATE TRIGGER solo_lectura BEFORE INSERT OR UPDATE OR DELETE ON pedidos_finanzas_archivo FOR EACH ROW EXECUTE FUNCTION archivo_solo_lectura();

-- 7. Pago de los pedidos que ya existen: todos se crearon con datos de prueba (nunca hubo un cobro real)
INSERT INTO pagos (pedido_id, origen, metodo, momento, estado, monto_centimos, creado_en)
SELECT id, 'prueba', metodo_pago,
       CASE WHEN metodo_pago = 'al_recibir' THEN 'al_recibir' ELSE 'antes' END,
       'de_prueba', total_centimos, creado_en
FROM pedidos ON CONFLICT (pedido_id) DO NOTHING;
INSERT INTO pago_eventos (pago_id, estado, detalle, creado_en)
SELECT g.id, 'de_prueba', 'Pedido creado con datos de prueba antes del cambio a pago directo', g.creado_en
FROM pagos g WHERE NOT EXISTS (SELECT 1 FROM pago_eventos e WHERE e.pago_id = g.id);
INSERT INTO devoluciones (pedido_id, origen, monto_centimos, estado, nota, creado_en)
SELECT p.id, CASE WHEN EXISTS (SELECT 1 FROM reclamos r WHERE r.pedido_id = p.id) THEN 'reclamo' ELSE 'cancelacion' END,
       p.total_centimos, 'de_prueba', 'Devolución registrada con datos de prueba', COALESCE(p.cerrado_en, p.creado_en)
FROM pedidos p WHERE p.pago_estado = 'devuelto' ON CONFLICT DO NOTHING;
