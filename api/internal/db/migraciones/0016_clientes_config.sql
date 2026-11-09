-- Clientes (nota privada) y Configuración: RUC, pausar la tienda y qué avisos recibir.
CREATE TABLE IF NOT EXISTS notas_clientes (
    tienda_id      UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
    cliente        TEXT NOT NULL, -- huella del celular del cliente (no se guarda el número otra vez)
    nota           TEXT NOT NULL DEFAULT '',
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tienda_id, cliente)
);
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS ruc     TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS pausada BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS avisos  JSONB NOT NULL DEFAULT '{"pedidos": true, "consultas": true, "inventario": true}';
-- Para mostrar en Seguridad cuándo se cambió la contraseña por última vez.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_cambiado_en TIMESTAMPTZ;
