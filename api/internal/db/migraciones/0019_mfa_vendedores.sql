-- Verificación en dos pasos opcional para vendedoras y confirmación con código
-- para lo delicado del dinero (cambiar la cuenta bancaria y retirar).
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_pendiente_cifrado TEXT;
ALTER TABLE codigos_otp DROP CONSTRAINT IF EXISTS codigos_otp_proposito_check;
ALTER TABLE codigos_otp ADD CONSTRAINT codigos_otp_proposito_check CHECK (proposito IN ('registro', 'recuperar', 'confirmar'));
