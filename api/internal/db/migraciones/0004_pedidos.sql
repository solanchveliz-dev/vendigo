CREATE SEQUENCE pedidos_codigo_seq START 10400;

CREATE TABLE pedidos (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo               TEXT NOT NULL UNIQUE DEFAULT 'VG-' || nextval('pedidos_codigo_seq'),
    tienda_id            UUID NOT NULL REFERENCES tiendas(id),
    comprador_id         UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    comprador_nombre     TEXT NOT NULL,
    comprador_celular    TEXT NOT NULL,
    comprador_dni_cifrado TEXT,
    -- Entrega: recojo en tienda, agencia (Shalom, Olva...) o motorizado
    entrega              TEXT NOT NULL CHECK (entrega IN ('recojo', 'agencia', 'motorizado')),
    direccion            TEXT NOT NULL DEFAULT '',
    distrito             TEXT NOT NULL DEFAULT '',
    ciudad               TEXT NOT NULL DEFAULT '',
    referencia           TEXT NOT NULL DEFAULT '',
    agencia              TEXT NOT NULL DEFAULT '',
    agencia_sede         TEXT NOT NULL DEFAULT '',
    codigo_recojo        TEXT NOT NULL DEFAULT '',
    estado               TEXT NOT NULL DEFAULT 'por_aceptar' CHECK (estado IN
                         ('por_aceptar', 'preparando', 'listo_recojo', 'enviado', 'entregado', 'rechazado', 'cancelado')),
    -- Pago protegido con Culqi. Con motorizado el comprador paga al recibir.
    metodo_pago          TEXT NOT NULL CHECK (metodo_pago IN ('yape', 'tarjeta', 'pagoefectivo', 'al_recibir')),
    pago_estado          TEXT NOT NULL CHECK (pago_estado IN ('pagado', 'pendiente', 'devuelto')),
    culqi_cargo_id       TEXT,
    subtotal_centimos    INT NOT NULL,
    envio_centimos       INT NOT NULL DEFAULT 0,
    total_centimos       INT NOT NULL,
    comision_pasarela_centimos INT NOT NULL DEFAULT 0,
    nota_comprador       TEXT NOT NULL DEFAULT '',
    motivo_cancelacion   TEXT NOT NULL DEFAULT '',
    confirmado_por       TEXT CHECK (confirmado_por IN ('comprador', 'automatico', 'vendedor')),
    liberar_en           TIMESTAMPTZ,
    liberado             BOOLEAN NOT NULL DEFAULT false,
    creado_en            TIMESTAMPTZ NOT NULL DEFAULT now(),
    aceptado_en          TIMESTAMPTZ,
    enviado_en           TIMESTAMPTZ,
    entregado_en         TIMESTAMPTZ,
    cerrado_en           TIMESTAMPTZ
);
CREATE INDEX pedidos_tienda_idx ON pedidos (tienda_id, estado, creado_en DESC);
CREATE INDEX pedidos_liberar_idx ON pedidos (liberar_en) WHERE NOT liberado AND estado = 'entregado';

CREATE TABLE pedido_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id     UUID REFERENCES productos(id) ON DELETE SET NULL,
    variante_id     UUID REFERENCES producto_variantes(id) ON DELETE SET NULL,
    nombre          TEXT NOT NULL,
    variante        TEXT NOT NULL DEFAULT '',
    imagen_key      TEXT,
    precio_centimos INT NOT NULL,
    cantidad        INT NOT NULL CHECK (cantidad > 0)
);

-- Datos del envío que registra el vendedor (la boleta es su prueba en un reclamo).
CREATE TABLE envios (
    pedido_id     UUID PRIMARY KEY REFERENCES pedidos(id) ON DELETE CASCADE,
    agencia       TEXT NOT NULL DEFAULT '',
    numero_orden  TEXT NOT NULL DEFAULT '',
    clave_recojo  TEXT NOT NULL DEFAULT '',
    boleta_key    TEXT,
    nota          TEXT NOT NULL DEFAULT '',
    registrado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pedido_eventos (
    id        BIGSERIAL PRIMARY KEY,
    pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    estado    TEXT NOT NULL,
    detalle   TEXT NOT NULL DEFAULT '',
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reclamos (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id          UUID NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE CASCADE,
    motivo             TEXT NOT NULL CHECK (motivo IN ('no_llego', 'danado', 'distinto', 'incompleto', 'otro')),
    descripcion        TEXT NOT NULL DEFAULT '',
    fotos              TEXT[] NOT NULL DEFAULT '{}',
    estado             TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'en_revision', 'a_favor_comprador', 'a_favor_vendedor')),
    respuesta_vendedor TEXT,
    evidencias         TEXT[] NOT NULL DEFAULT '{}',
    respondido_en      TIMESTAMPTZ,
    resuelto_en        TIMESTAMPTZ,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notificaciones (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    titulo     TEXT NOT NULL,
    cuerpo     TEXT NOT NULL DEFAULT '',
    enlace     TEXT NOT NULL DEFAULT '',
    leida      BOOLEAN NOT NULL DEFAULT false,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notificaciones_usuario_idx ON notificaciones (usuario_id, creado_en DESC);

-- Libro de movimientos de dinero. El saldo de cada bolsa (a_liberar, disponible, retirado)
-- es la suma de sus movimientos; nunca se edita un movimiento, solo se agregan nuevos.
CREATE TABLE movimientos (
    id         BIGSERIAL PRIMARY KEY,
    tienda_id  UUID NOT NULL REFERENCES tiendas(id),
    pedido_id  UUID REFERENCES pedidos(id),
    retiro_id  UUID,
    tipo       TEXT NOT NULL CHECK (tipo IN ('cobro', 'comision_pasarela', 'liberacion', 'retiro', 'devolucion')),
    bolsa      TEXT NOT NULL CHECK (bolsa IN ('a_liberar', 'disponible', 'retirado')),
    monto_centimos INT NOT NULL,
    detalle    TEXT NOT NULL DEFAULT '',
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_tienda_idx ON movimientos (tienda_id, bolsa);
