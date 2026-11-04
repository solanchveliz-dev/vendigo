# VendiGo

Plataforma donde los emprendedores del Perú crean su tienda y los compradores encuentran tiendas con pago protegido.

Proyecto de Fin de Carrera — Tecsup, Diseño y Desarrollo de Software.

- Solanch Naomi Veliz Pie
- Nadhira Alejandra Atanacio Bejarano

## Estructura

| Carpeta | Contenido |
|---|---|
| `api/` | API REST en Go (monolito modular) |
| `web/` | Web en Next.js: tiendas públicas, panel del vendedor y del administrador |
| `app/` | App móvil en React Native + Expo (comprador y vendedor) |
| `infra/` | Infraestructura en AWS con Terraform |

## Ramas

- `main`: versiones entregadas.
- `develop`: integración de funciones terminadas.
- `feature/<nombre>`: una rama por función, sale de `develop` y vuelve a `develop`.
- `release/<versión>`: preparación de una entrega antes de pasar a `main`.

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

4. Worker de tareas programadas (liberación de dinero y confirmaciones automáticas):

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
