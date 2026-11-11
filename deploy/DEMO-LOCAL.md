# Demo local con servicios reales de AWS

La aplicación corre en tu computadora, pero los SMS, las fotos y la IA usan AWS de verdad.
El despliegue completo (EC2 + RDS) está en `README.md` de esta carpeta.

Nunca compartas ni subas a GitHub las llaves: van solo en `api/.env`, que está en `.gitignore`.

## 1. Usuario de IAM para pruebas (región us-east-1)
- IAM → Users → Create user (sin acceso a la consola).
- Política: copia `aws/politica-rol-ec2.json` y cambia `tuapellido` por el nombre de tus buckets.
- Security credentials → Create access key → "Application running outside AWS". Guárdala en un lugar seguro.

## 2. Buckets de S3
- `vendigo-publico-<nombre>`: desbloquea el acceso público, Bucket policy = `aws/s3-publico-politica.json` (con tu nombre).
- `vendigo-privado-<nombre>`: con **Block all public access** activado (DNI y comprobantes).
- En los dos: Permissions → CORS → `aws/s3-cors-local.json` con tu dominio de ngrok.

## 3. SMS (Amazon SNS, us-east-1)
- SNS → Text messaging (SMS) → Account spend limit: 1 USD.
- Sandbox destination phone numbers → agrega y verifica cada celular que recibirá SMS
  (vendedora, comprador y el tuyo). En el sandbox solo llegan SMS a números verificados (máximo 10).

## 4. `api/.env`
```
WEB_URL=https://TU-DOMINIO.ngrok-free.dev
OTP_CANAL=sms
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

S3_ENDPOINT=
S3_REGION=us-east-1
S3_ACCESS_KEY=          (vacío: usa las llaves AWS_ de arriba)
S3_SECRET_KEY=
S3_BUCKET_PUBLICO=vendigo-publico-<nombre>
S3_BUCKET_PRIVADO=vendigo-privado-<nombre>
MEDIA_PUBLIC_URL=https://vendigo-publico-<nombre>.s3.us-east-1.amazonaws.com

IA_PROVEEDOR=bedrock

# Mercado Pago queda apagado en la demo (vacío = la opción no aparece)
MP_CLIENT_ID=
MP_CLIENT_SECRET=
```
En `web/.env.local` agrega `DEV_ORIGENES=TU-DOMINIO.ngrok-free.dev` (sin https://).

## 5. Arrancar
```
cd api && go run ./cmd/api          # aplica migraciones; en dev también envía los SMS en cola cada 30 s
cd web && npm run dev
ngrok http --url=TU-DOMINIO.ngrok-free.dev 3000
```
Las fotos que subiste antes a MinIO no estarán en S3: vuelve a subir las fotos de la tienda de la demo.

## 6. Comprobar antes de presentar
- Admin → Configuración → "Servicios (AWS y pagos)": SMS real, IA bedrock.
- "Enviar SMS de prueba" a tu celular.
- Registrar una cuenta nueva: el código llega por SMS y la web ya no lo completa sola.
- Subir una foto de producto y verla en la tienda pública.
- Hacer un pedido desde otro celular verificado: llega el SMS de pedido nuevo a la vendedora.
