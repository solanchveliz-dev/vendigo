-- Uso de las herramientas de IA. Cada plan trae créditos al mes; las imágenes gastan más.
CREATE TABLE uso_ia (
    id         BIGSERIAL PRIMARY KEY,
    tienda_id  UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    herramienta TEXT NOT NULL CHECK (herramienta IN ('publicar_con_foto', 'leer_boleta', 'crear_post', 'resumen_opiniones')),
    creditos   INT NOT NULL,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX uso_ia_tienda_idx ON uso_ia (tienda_id, creado_en);

CREATE TABLE creditos_extra (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tienda_id      UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    cantidad       INT NOT NULL,
    monto_centimos INT NOT NULL,
    periodo        DATE NOT NULL,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
