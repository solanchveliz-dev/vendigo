-- Analista de ventas con IA: nueva herramienta que gasta créditos.
ALTER TABLE uso_ia DROP CONSTRAINT IF EXISTS uso_ia_herramienta_check;
ALTER TABLE uso_ia ADD CONSTRAINT uso_ia_herramienta_check
    CHECK (herramienta IN ('publicar_con_foto', 'leer_boleta', 'crear_post', 'resumen_opiniones', 'analista_ventas'));
