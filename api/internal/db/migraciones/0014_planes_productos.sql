-- Límite de productos publicados por plan (NULL = ilimitados), como en el prototipo.
ALTER TABLE planes ADD COLUMN IF NOT EXISTS productos_max INT;
UPDATE planes SET productos_max = CASE id WHEN 'gratis' THEN 15 WHEN 'emprende' THEN 100 ELSE NULL END;
