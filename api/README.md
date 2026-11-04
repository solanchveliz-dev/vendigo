# API de VendiGo (Go)

Monolito modular: una sola aplicación dividida en módulos con responsabilidades claras.

```
cmd/
  api/      servidor HTTP
  worker/   tareas programadas (liberar dinero, dar por recibidos los envíos)
  seed/     datos de prueba
internal/
  config/        variables de entorno
  db/            conexión y migraciones (db/migraciones/*.sql)
  core/          dependencias compartidas (base de datos, cifrado, archivos, avisos)
  httpx/         respuestas JSON, errores y middlewares (JWT, roles, límite de intentos, CORS)
  seguridad/     contraseñas (PBKDF2), JWT, códigos OTP, cifrado AES-256-GCM
  archivos/      Amazon S3 con URLs firmadas
  avisos/        SMS con Amazon SNS
  auth/          registro, código OTP, inicio de sesión y recuperación
  tiendas/       tienda, formas de entrega y subida de imágenes
  productos/     productos, variantes, ofertas y preguntas
  pedidos/       pedidos, envíos, reclamos y notificaciones
  billetera/     libro de movimientos: a liberar, disponible, retiros
  planes/        planes con cupo de ventas
  ia/            herramientas de IA con créditos (Amazon Bedrock)
  demo/          simula al comprador (solo APP_ENV=dev)
```

## Rutas principales (`/api/v1`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/registro` | Crea la cuenta y envía el código OTP |
| POST | `/auth/verificar` | Confirma el celular y devuelve la sesión |
| POST | `/auth/login` · `/auth/refresh` · `/auth/logout` | Sesión con JWT y refresh token rotativo |
| POST | `/auth/recuperar` · `/auth/restablecer` | Recuperar contraseña con código |
| GET | `/me` | Usuario actual |
| POST | `/tienda` | Crear tienda (el usuario pasa a vendedor) |
| GET/PUT | `/vendedor/tienda` · `/vendedor/tienda/entrega` | Perfil y formas de entrega |
| POST | `/vendedor/archivos` | URL firmada para subir una imagen a S3 |
| GET/POST | `/vendedor/productos` | Listar y publicar productos |
| PUT/DELETE | `/vendedor/productos/{id}/oferta` | Poner o quitar una oferta |
| GET | `/vendedor/resumen` | Inicio del vendedor ("Te toca") |
| GET | `/vendedor/pedidos?grupo=` | Pedidos: por_aceptar, por_enviar, recogen, en_camino, terminados |
| POST | `/vendedor/pedidos/{id}/aceptar` · `rechazar` · `enviar` · `listo-recojo` · `entregar-recojo` | Pasos del pedido |
| POST | `/vendedor/reclamos/{id}/responder` | Responder un reclamo con pruebas |
| GET | `/vendedor/cobros` | A liberar, disponible, retiros |
| POST | `/vendedor/retiros` | Retirar a la cuenta bancaria |
| GET/PUT | `/vendedor/cuenta-bancaria` | Cuenta para los cobros (cifrada) |
| GET/POST | `/vendedor/verificacion` | Verificación de identidad |
| GET/POST | `/vendedor/plan` · `/vendedor/plan/ventas-extra` | Plan y cupo de ventas |
| GET/POST | `/vendedor/ia` · `/vendedor/ia/*` | Créditos y herramientas de IA |
| GET | `/tiendas/{slug}` · `/tiendas/{slug}/productos` | Tienda pública |

## Pruebas

```
go test ./...
```
