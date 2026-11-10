# API de VendiGo (Go)

Monolito modular: una sola aplicación dividida en módulos con responsabilidades claras.

```
cmd/
  api/      servidor HTTP
  worker/   tareas programadas (dar por recibidos los envíos por agencia a los 7 días)
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
  pedidos/       pedidos, envíos, reclamos, devoluciones y notificaciones
  pagos/         estado del pago de cada pedido y reglas del fondo de emergencia (VendiGo no recibe el dinero)
  compras/       compra sin cuenta con código SMS y seguimiento por enlace secreto
  billetera/     verificación de identidad, avisos y días hábiles (ya no maneja dinero)
  planes/        planes con cupo de ventas, ventas extra e impulsos (cobro de VendiGo con Culqi)
  admin/         panel del administrador
  libro/         Libro de Reclamaciones y datos legales
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
| POST | `/vendedor/pedidos/{id}/pago` | La tienda informa si recibió el pago |
| POST | `/vendedor/pedidos/{id}/devolucion` | La tienda informa la devolución con su captura |
| POST | `/vendedor/reclamos/{id}/devolver` | La tienda acepta el reclamo |
| GET | `/vendedor/ventas` | Reporte informativo de ventas (no es un saldo) |
| PUT | `/vendedor/tienda/pagos` | Medios con los que la tienda cobra directo |
| GET/POST | `/vendedor/verificacion` | Verificación de identidad |
| GET/POST | `/vendedor/plan` · `/vendedor/plan/ventas-extra` | Plan y cupo de ventas |
| POST | `/vendedor/productos/{id}/destacar` | Impulsar un producto |
| GET/POST | `/vendedor/ia` · `/vendedor/ia/*` | Créditos y herramientas de IA |
| GET | `/tiendas/{slug}` · `/tiendas/{slug}/productos` | Tienda pública |
| POST | `/compras/codigo` · `/compras` | Compra sin cuenta con código SMS |
| GET/POST | `/seguimiento/{token}` · `.../comprobante` · `.../recibido` · `.../reclamo` | Seguimiento del comprador |
| GET | `/legal/proveedor` | Datos legales y reglas vigentes del fondo de emergencia |
| * | `/admin/*` | Panel del administrador (rol admin con verificación en dos pasos) |

## Pruebas

```
go test ./...
```

## Probar SMS (Amazon SNS) e IA (Amazon Bedrock) reales en local

Por defecto todo es gratis y simulado (`OTP_CANAL=log`, `IA_PROVEEDOR=simulado`). Para probar con tu cuenta de AWS:

1. **Usuario de IAM solo para pruebas** (IAM → Users → Create user, sin acceso a la consola). Adjúntale una política
   con solo dos permisos: `sns:Publish` sobre `*` y `bedrock:InvokeModel` sobre
   `arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0`. Crea una *access key* (tipo "Local code").
2. **Llaves en `api/.env`** (nunca en GitHub; `.env` ya está en `.gitignore`):
   ```
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-1
   OTP_CANAL=sms
   IA_PROVEEDOR=bedrock
   ```
   Las llaves `S3_ACCESS_KEY` / `S3_SECRET_KEY` siguen siendo las de MinIO: no se mezclan.
3. **SMS:** la cuenta nueva está en el *sandbox* de SMS. En la consola (región us-east-1) agrega y verifica tus
   celulares de prueba (`+51 9XXXXXXXX`) en "Sandbox destination phone numbers". El límite de gasto inicial es
   de US$ 1 al mes: alcanza para probar, no para producción.
4. **IA:** en Bedrock → Model catalog abre **Amazon Nova Lite** (`amazon.nova-lite-v1:0`) y, si la consola lo
   pide, habilita el acceso. Prueba "Publicar con foto" (al crear un producto) o el "Analista de ventas" desde el panel del vendedor.
5. Reinicia la API. Si algo falla, el error aparece en la consola de la API (`AccessDenied` = falta un permiso;
   un SMS que no llega en sandbox = el número no está verificado).

Para volver al modo gratis basta con regresar `OTP_CANAL=log` e `IA_PROVEEDOR=simulado`.
