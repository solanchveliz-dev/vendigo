-- ubicacion_auto: la ubicación la calculó OpenStreetMap a partir de la dirección; el admin debe revisarla.
-- de_ejemplo: sedes de demostración (las del prototipo). Se muestran avisadas para no mandar a nadie a una dirección no confirmada.
ALTER TABLE agencias_sedes ADD COLUMN IF NOT EXISTS ubicacion_auto BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agencias_sedes ADD COLUMN IF NOT EXISTS de_ejemplo BOOLEAN NOT NULL DEFAULT false;

-- Las 12 sedes que carga el seed de demostración quedan marcadas como ejemplo (solo si nadie cambió su dirección).
UPDATE agencias_sedes SET de_ejemplo = true WHERE (nombre, direccion) IN (
    ('Shalom Jesús María', 'Av. Brasil 1250, Jesús María'),
    ('Shalom Los Olivos', 'Av. Universitaria 7020, Los Olivos'),
    ('Shalom Surco', 'Av. Tomás Marsano 3050, Surco'),
    ('Shalom La Victoria', 'Av. Aviación 820, La Victoria'),
    ('Shalom Arequipa Centro', 'Av. Parra 205, Arequipa'),
    ('Shalom Trujillo', 'Av. América Norte 1540, Trujillo'),
    ('Shalom Cusco', 'Av. de la Cultura 1720, Cusco'),
    ('Shalom Piura', 'Av. Sánchez Cerro 1450, Piura'),
    ('Olva Miraflores', 'Av. Benavides 1180, Miraflores'),
    ('Olva Arequipa', 'Calle San Juan de Dios 310, Arequipa'),
    ('Marvisur Arequipa', 'Av. Salaverry 115, Arequipa'),
    ('Marvisur Lima', 'Av. 28 de Julio 1250, La Victoria')
);
