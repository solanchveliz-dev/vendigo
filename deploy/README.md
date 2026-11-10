# Despliegue de VendiGo en AWS

Arquitectura de bajo costo para la demostración y el piloto:

```
Navegador ──HTTPS──▶ EC2 (Docker Compose)
                       ├─ Caddy  (certificado HTTPS automático)
                       ├─ web    (Next.js) ──▶ api (Go) ──▶ Amazon RDS PostgreSQL
                       ├─ api    ─────────────────────────▶ Amazon S3 · Amazon SNS (SMS) · Amazon Bedrock · Culqi
                       └─ worker (tareas cada minuto: envíos de 7 días, bandeja de SMS)
```

- Solo la web queda expuesta; la API se alcanza por la red interna de Docker.
- Los permisos de AWS los da el **rol de la instancia**: no hay llaves de AWS en ningún archivo.
- Las migraciones de la base corren solas cuando arranca la API.

Todo se hace en la región **us-east-1 (N. Virginia)**, donde están Bedrock Nova Lite y SNS SMS.

---

## 0. Antes de empezar (10 min)

1. **Billing → Budgets → Create budget**: presupuesto mensual de US$ 10 con aviso al 80 % a tu correo.
2. Ten a la mano un nombre corto para los buckets, por ejemplo tu apellido: `vendigo-publico-veliz` y `vendigo-privado-veliz` (los nombres de S3 son únicos en el mundo).
3. En todos los archivos de `deploy/aws/` reemplaza `tuapellido` por ese nombre.

## 1. Buckets de S3

**Bucket privado** (DNI, boletas, comprobantes):
- S3 → Create bucket → `vendigo-privado-veliz`, región us-east-1, **Block all public access activado** (por defecto).
- Permissions → CORS → pega `aws/s3-cors.json` (con tu dominio, ver paso 4).

**Bucket público** (fotos de productos y logos):
- Create bucket → `vendigo-publico-veliz` → **desmarca** "Block all public access" y confirma.
- Permissions → Bucket policy → pega `aws/s3-publico-politica.json`.
- Permissions → CORS → pega `aws/s3-cors.json`.

## 2. Rol de la instancia (IAM)

1. IAM → Policies → Create policy → JSON → pega `aws/politica-rol-ec2.json` → nombre `VendiGoServidor`.
2. IAM → Roles → Create role → AWS service → **EC2** → adjunta `VendiGoServidor` → nombre `VendiGoEC2`.

El rol solo puede tocar sus dos buckets, enviar SMS y usar Nova Lite. Nada más.

## 3. Base de datos (Amazon RDS)

1. RDS → Create database → **Standard create** → PostgreSQL **16**.
2. Plantilla **Free tier** · instancia `db.t4g.micro` · 20 GB gp3 · sin autoescalado de almacenamiento.
3. Identificador `vendigo-db`, usuario `vendigo`, contraseña larga (guárdala).
4. Conectividad: **Public access: No**. Crea un grupo de seguridad nuevo `vendigo-rds`.
5. Additional configuration → Initial database name: `vendigo`. Backups automáticos: 7 días.

Cuando termine, copia el **Endpoint** (algo como `vendigo-db.xxxx.us-east-1.rds.amazonaws.com`).

## 4. Servidor (Amazon EC2)

1. EC2 → Launch instance → **Amazon Linux 2023** · `t3.micro` (capa gratuita) o `t3.small` si el build se demora mucho · disco 20 GB gp3.
2. Key pair: crea `vendigo` (descarga el `.pem`, no lo subas a GitHub).
3. Grupo de seguridad `vendigo-web`: entrada **22** (tu IP; o 0.0.0.0/0 si usarás el despliegue automático de GitHub), **80** y **443** desde 0.0.0.0/0.
4. Advanced details → IAM instance profile → `VendiGoEC2`.
5. Al terminar: EC2 → Elastic IPs → Allocate → Associate a la instancia. Esa IP es la del sitio.
6. Vuelve al grupo `vendigo-rds` (paso 3) y agrega entrada **5432** con origen el grupo `vendigo-web`.

**Dominio:** sin dominio propio usa `sslip.io`: si la IP es `3.90.12.34`, el dominio es `3-90-12-34.sslip.io`. Caddy saca el certificado HTTPS solo. Pon ese dominio en `aws/s3-cors.json` y actualiza el CORS de los dos buckets.

## 5. SMS y IA

- **SNS:** las cuentas nuevas empiezan en el *sandbox* de SMS: solo envían a celulares verificados. SNS → Mobile → Text messaging (SMS) → Sandbox destination phone numbers → agrega los celulares de la demo (`+51 9XXXXXXXX`). Para salir del sandbox hay que pedirlo a AWS (no es necesario para la tesis).
- **Bedrock:** Bedrock → Model catalog → **Amazon Nova Lite**. Si la consola pide habilitar el acceso al modelo, hazlo.

## 6. Instalar VendiGo en el servidor

Conéctate (desde la carpeta donde está el `.pem`):

```bash
chmod 400 vendigo.pem
ssh -i vendigo.pem ec2-user@3.90.12.34
```

En el servidor:

```bash
git clone https://github.com/solanchveliz-dev/vendigo.git ~/vendigo
cd ~/vendigo
bash deploy/preparar-servidor.sh
exit          # vuelve a entrar para que docker funcione sin sudo
```

> Si el repositorio es privado: en GitHub → Settings → Deploy keys agrega una llave de solo lectura generada en el servidor (`ssh-keygen -t ed25519`) y clona con `git@github.com:solanchveliz-dev/vendigo.git`.

Configura las variables (aquí, nunca en GitHub):

```bash
cd ~/vendigo
cp deploy/.env.ejemplo deploy/.env
openssl rand -base64 48   # pega el resultado en JWT_SECRET
openssl rand -base64 32   # pega el resultado en ENCRYPTION_KEY
nano deploy/.env          # completa dominio, RDS, buckets y Culqi
```

> **ENCRYPTION_KEY** cifra los DNI: si se pierde, los DNI guardados ya no se pueden leer. Guárdala también en un gestor de contraseñas.

Primer despliegue (la primera vez tarda 10–15 min por el build):

```bash
./deploy/desplegar.sh develop     # o main cuando ya esté la versión final
```

## 7. Administrador y datos de demostración

Crear la cuenta de administrador (correo de la empresa; al primer ingreso configura la app de autenticación):

```bash
cd ~/vendigo/deploy
docker compose run --rm -e ADMIN_PASSWORD='Una-Clave-Muy-Segura-2026' --entrypoint /app/admin api \
  -nombre "Nombre Apellido" -celular 9XXXXXXXX -email admin@tuempresa.pe
```

Cargar la tienda de demostración *Luna & Sol* (opcional; queda con su DNI por revisar para mostrar la verificación):

```bash
docker compose run --rm -e SEED_SERVIDOR=1 -e SEED_CLAVE='Clave-Demo-2026' --entrypoint /app/seed api
```

En el servidor el seed **no** crea el administrador de prueba de local ni usa la contraseña pública `vendigo123`.

## 8. Despliegue automático desde GitHub (opcional)

1. En el repositorio: Settings → Secrets and variables → Actions → **Secrets**: `EC2_HOST` (IP elástica), `EC2_USUARIO` (`ec2-user`), `EC2_LLAVE_SSH` (contenido completo del `.pem`).
2. Pestaña **Variables**: `DESPLIEGUE_ACTIVO` = `1`.
3. Desde ahí, cada push a `main` despliega solo. Para probar otra rama: Actions → Desplegar → Run workflow → rama `develop`.

## Operación diaria

```bash
cd ~/vendigo/deploy
docker compose ps                    # estado de los servicios
docker compose logs -f api worker    # registros en vivo
docker compose restart api           # reiniciar uno
```

- **Ahorrar cuando no se usa:** detén la instancia EC2 y la base RDS desde la consola (RDS se vuelve a encender sola a los 7 días). La IP elástica se cobra aunque la instancia esté apagada.
- **Respaldo:** RDS guarda copias automáticas 7 días. Antes de una demo importante: RDS → Actions → Take snapshot.

## Costo aproximado (us-east-1, sin capa gratuita)

| Servicio | Configuración | US$/mes |
|---|---|---|
| EC2 | t3.micro, 20 GB | ≈ 9 |
| IP pública (elástica) | 1 | ≈ 3,6 |
| RDS PostgreSQL | db.t4g.micro, 20 GB | ≈ 14 |
| S3 | pocos GB | < 1 |
| SNS SMS a Perú | por mensaje enviado | según uso |
| Bedrock Nova Lite | pruebas de IA | < 1 |
| **Total** | | **≈ 28 + SMS** |

Con la capa gratuita de una cuenta nueva, EC2 (t3.micro) y RDS (db.t4g.micro) quedan cubiertos durante el periodo gratuito; confirma los montos en la calculadora de AWS. No hay balanceador, NAT ni CloudFront: es lo que más encarece este tipo de despliegue.
