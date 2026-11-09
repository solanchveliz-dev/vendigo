-- Datos de "Tu tienda" que pide el prototipo: correo de contacto, horario de atención y política de cambios.
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS correo    TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS horario   TEXT NOT NULL DEFAULT '';
ALTER TABLE tiendas ADD COLUMN IF NOT EXISTS politicas TEXT NOT NULL DEFAULT '';
