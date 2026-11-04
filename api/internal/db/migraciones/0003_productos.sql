CREATE TABLE productos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tienda_id       UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    descripcion     TEXT NOT NULL DEFAULT '',
    categoria       TEXT NOT NULL DEFAULT '',
    precio_centimos INT NOT NULL CHECK (precio_centimos > 0),
    stock           INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    activo          BOOLEAN NOT NULL DEFAULT true,
    eliminado       BOOLEAN NOT NULL DEFAULT false,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX productos_tienda_idx ON productos (tienda_id) WHERE NOT eliminado;

-- Variantes: talla, color, sabor... Si un producto tiene variantes, su stock es la suma de ellas.
CREATE TABLE producto_variantes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id     UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    nombre          TEXT NOT NULL,
    stock           INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    precio_centimos INT CHECK (precio_centimos > 0),
    orden           INT NOT NULL DEFAULT 0
);

CREATE TABLE producto_imagenes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    orden       INT NOT NULL DEFAULT 0
);

CREATE TABLE ofertas (
    producto_id   UUID PRIMARY KEY REFERENCES productos(id) ON DELETE CASCADE,
    descuento_pct INT NOT NULL CHECK (descuento_pct BETWEEN 5 AND 90),
    inicia_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
    termina_en    TIMESTAMPTZ NOT NULL
);

-- Preguntas públicas de los compradores en cada producto.
CREATE TABLE preguntas (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id      UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    usuario_id       UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    autor_nombre     TEXT NOT NULL,
    pregunta         TEXT NOT NULL,
    respuesta        TEXT,
    respondida_en    TIMESTAMPTZ,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX preguntas_producto_idx ON preguntas (producto_id);
