# VendiGo

Plataforma donde los emprendedores del Perú crean su tienda y los compradores siguen su pedido con reclamos mediados por VendiGo.
El comprador le paga directo a la tienda (Yape, Plin, transferencia o el link de tarjeta de la tienda): VendiGo no recibe ni retiene el dinero de las ventas.

Proyecto de Fin de Carrera — Tecsup, Diseño y Desarrollo de Software.

- Solanch Naomi Veliz Pie
- Nadhira Alejandra Atanacio Bejarano

## Estructura

| Carpeta | Contenido |
|---|---|
| `api/` | API REST en Go (monolito modular) |
| `web/` | Web en Next.js: tiendas públicas, compra y seguimiento, panel del vendedor y del administrador |

Planificadas (todavía no están en el repositorio): `app/` (app móvil con React Native + Expo) e `infra/` (AWS con Terraform).

## Ramas

- `main`: versiones entregadas.
- `develop`: integración de funciones terminadas.
- `feature/<nombre>`: una rama por función, sale de `develop` y vuelve a `develop`.
- `release/<versión>`: preparación de una entrega antes de pasar a `main`.

## Roles y permisos

| Rol | Cómo entra | Qué puede hacer | Qué no puede hacer |
|---|---|---|---|
| Comprador | Sin cuenta: confirma su celular con un código SMS al comprar | Comprar, pagar directo a la tienda, seguir su pedido con un enlace secreto, reclamar | Entrar a `/vendedor` o `/admin`; comprar en su propia tienda |
| Vendedora | Celular o correo y contraseña (verificación en dos pasos opcional) | Su panel `/vendedor`: tienda, productos, pedidos, reclamos, planes. Su tienda se muestra cuando el admin aprueba su DNI | Entrar a `/admin`; comprar en su propia tienda |
| Administrador | Solo correo de la empresa, contraseña y código de su app (siempre) | Panel `/admin`: verificar identidades y RUC, mediar reclamos, fondo de emergencia, cobros, seguridad | Tener tienda o entrar al panel de vendedora |

La API exige el rol en cada ruta (`/vendedor/*` y `/admin/*`) y registra cada intento sin permiso; la web además
redirige a cada cuenta a su panel. Una cuenta de comprador puede crear su tienda y pasa a ser vendedora.

## Cómo levantar el proyecto en local

Requisitos: Docker Desktop, Go 1.24 o superior y Node.js 20 o superior.

1. Base de datos y almacenamiento local (PostgreSQL + MinIO, compatible con S3):

   ```
   docker compose up -d
   ```

2. API:

   ```
   cd api
   copy .env.example .env
   go run ./cmd/api
   ```

   La API corre en `http://localhost:8080` y crea las tablas al iniciar.

3. Datos de prueba (opcional):

   ```
   go run ./cmd/seed
   ```

4. Worker de tareas programadas (da por recibidos los envíos por agencia a los 7 días sin reclamo). En AWS lo dispara EventBridge; en local déjalo corriendo en otra terminal:

   ```
   go run ./cmd/worker
   ```

5. Web:

   ```
   cd web
   copy .env.example .env.local
   npm install
   npm run dev
   ```

   La web corre en `http://localhost:3000`.

## Versión 0.1

Perfil del vendedor completo: cuenta con código OTP, tienda, productos con IA, pedidos con pago protegido, envíos, reclamos, cobros, retiros, verificación de identidad y planes con cupo de ventas.

## Versión 0.2 (en `develop`)

Pago directo a la tienda: VendiGo ya no custodia dinero. Cada pedido registra el estado de su pago y sus devoluciones;
la tienda informa lo que recibió y lo que devolvió con su captura, y el administrador da seguimiento y media los reclamos.
El fondo de emergencia de VendiGo cubre los pedidos que no le llegaron al comprador cuando la tienda no devuelve a tiempo.
Los saldos, liberaciones y retiros del modelo anterior quedan en tablas de archivo de solo lectura.
