-- Segundo paso por SMS para vendedoras que no quieren instalar una app de autenticación.
-- totp_activo sigue diciendo si el segundo paso está activo; mfa_metodo dice cuál usa.
-- Los administradores siempre usan la app.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS mfa_metodo TEXT NOT NULL DEFAULT 'app';
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_mfa_metodo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_mfa_metodo_check CHECK (mfa_metodo IN ('app', 'sms'));

-- Código que llega por SMS al ingresar.
ALTER TABLE codigos_otp DROP CONSTRAINT IF EXISTS codigos_otp_proposito_check;
ALTER TABLE codigos_otp ADD CONSTRAINT codigos_otp_proposito_check
    CHECK (proposito IN ('registro', 'recuperar', 'confirmar', 'compra', 'cambio_celular', 'ingreso'));
