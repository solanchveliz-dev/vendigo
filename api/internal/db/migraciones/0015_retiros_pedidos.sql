-- Cada retiro lleva los pedidos liberados que incluye (pantalla "Retiro del …" del prototipo).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS retiro_id UUID REFERENCES retiros(id);
CREATE INDEX IF NOT EXISTS pedidos_retiro_idx ON pedidos (retiro_id);
