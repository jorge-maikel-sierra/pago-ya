# Despliegue en Render.com — Pago Ya

Guía paso a paso para conectar el repositorio GitHub a Render y activar
el despliegue automático en cada `push` a `main`.

---

## Arquitectura desplegada (plan gratuito)

```
GitHub (rama main)
       │  push
       ▼
Render Blueprint (render.yaml)
  └── pago-ya-web  → Web Service Node.js 20 (Express + Socket.io)

Base de datos:  Prisma Postgres (capa gratuita — console.prisma.io)
Redis:          ✗ desactivado — se activa al migrar a plan de pago
```

> **Sin Redis:** las sesiones usan `MemoryStore` (se pierden al reiniciar el
> servidor) y los workers BullMQ (Telegram, mora, PDF) no se inician.
> Esto es aceptable en la etapa gratuita. Ver sección **Migrar a Redis** abajo.

---

## Paso 1 — Obtener la URL de Prisma Postgres

1. Ve a [console.prisma.io](https://console.prisma.io) y crea una cuenta.
2. Crea un nuevo proyecto → **New Database** (capa gratuita disponible).
3. Copia la **Connection String** (`prisma+postgres://...`).  
   La necesitarás en el Paso 3.

---

## Paso 2 — Conectar GitHub a Render

1. Ve a [dashboard.render.com](https://dashboard.render.com) y crea una cuenta.
2. En **Account Settings → Git Providers**, conecta tu cuenta de GitHub.

---

## Paso 3 — Aplicar el Blueprint

1. En el dashboard: **New → Blueprint**.
2. Selecciona el repositorio `pago-ya`.
3. Render detecta `render.yaml` automáticamente → haz clic en **Apply**.
4. Durante la creación, Render pedirá los valores de las variables `sync: false`:

| Variable | Valor a ingresar |
|---|---|
| `DATABASE_URL` | Connection string de Prisma Postgres (Paso 1) |
| `TELEGRAM_BOT_TOKEN` | Token de `@BotFather` (opcional por ahora) |
| `TELEGRAM_CHAT_ID` | ID del chat/canal de Telegram (opcional) |
| `CORS_ORIGIN` | `https://pago-ya-web.onrender.com` (completar tras el 1er deploy) |

> Las variables `JWT_SECRET`, `SESSION_SECRET` y `JWT_REFRESH_SECRET` se
> generan automáticamente con `generateValue: true`.

---

## Paso 4 — Verificar el primer despliegue

Render ejecuta automáticamente:

1. `npm install`
2. `npm run build:css`
3. `npm run db:generate` ← genera Prisma Client
4. *(pre-deploy)* `npm run db:migrate:prod` ← aplica migraciones
5. `npm start`

Sigue el progreso en **Dashboard → pago-ya-web → Logs**.  
El health check en `/api/health` confirma que el servicio está listo.

---

## Paso 5 — Auto-deploy en cada push a `main`

Ya configurado en `render.yaml`:

```yaml
branch: main
autoDeployTrigger: commit
```

Flujo completo:

```
git push origin main
      │
      ▼
GitHub notifica a Render
      │
      ▼
Render: build → pre-deploy (migraciones) → swap (zero-downtime)
```

Si el build o las migraciones fallan, la versión en producción **no se reemplaza**.

---

## Variables de entorno de referencia

| Variable | Fuente | Notas |
|---|---|---|
| `DATABASE_URL` | Manual (formulario) | String de Prisma Postgres |
| `JWT_SECRET` | Auto (generado) | 256-bit aleatorio |
| `JWT_EXPIRES_IN` | `render.yaml` | `8h` |
| `JWT_REFRESH_SECRET` | Auto (generado) | 256-bit aleatorio |
| `SESSION_SECRET` | Auto (generado) | 256-bit aleatorio |
| `TELEGRAM_BOT_TOKEN` | Manual | Opcional — bot de Telegram |
| `TELEGRAM_CHAT_ID` | Manual | Opcional |
| `CORS_ORIGIN` | Manual | URL del servicio en Render |
| `USURY_RATE_ANNUAL` | `render.yaml` | `0.36` |
| `DEFAULT_MORA_RATE_ANNUAL` | `render.yaml` | `0.12` |
| `NODE_ENV` | `render.yaml` | `production` |

---

## Migrar a Redis (cuando se cambie de plan)

Cuando el proyecto escale a un plan de pago, activar Redis en 3 pasos:

### 1. Agregar Key Value en `render.yaml`

```yaml
services:
  # ... (web service existente)
  - type: keyvalue
    name: pago-ya-redis
    plan: starter
    region: oregon
    maxmemoryPolicy: noeviction

# En envVars del web service, agregar:
      - key: REDIS_URL
        fromService:
          name: pago-ya-redis
          type: keyvalue
          property: connectionString
```

### 2. Hacer push a `main`

Render aplica los cambios automáticamente al detectar la actualización del Blueprint.

### 3. Resultado

- `src/config/redis.js` detecta `REDIS_URL` → crea cliente automáticamente
- `src/app.js` usa `RedisStore` para sesiones persistentes
- `src/server.js` inicia workers BullMQ (Telegram, mora, PDF)

---

## Rollbacks

Dashboard → **pago-ya-web → Events** → selecciona el deploy anterior
→ **Rollback to this deploy**.

---

## Desarrollo local

Para desarrollo local usa `.env` con las variables originales:

```env
DATABASE_URL=postgresql://...   # Tu BD local o Prisma Postgres dev
SESSION_SECRET=dev-secret-local
JWT_SECRET=dev-jwt-secret-local
JWT_REFRESH_SECRET=dev-refresh-secret-local
# REDIS_HOST=127.0.0.1   ← descomentar si usas Redis local
```

Sin `REDIS_HOST` ni `REDIS_URL`, el servidor arranca sin Redis — igual que en
producción con el plan gratuito.

Guía paso a paso para conectar el repositorio GitHub a Render y activar
el despliegue automático en cada `push` a `main`.

---

## Arquitectura desplegada

```
GitHub (rama main)
       │  push
       ▼
Render Blueprint (render.yaml)
  ├── pago-ya-web      → Web Service  Node.js 20  (Express + Socket.io + BullMQ)
  ├── pago-ya-redis    → Key Value    (Valkey/Redis — sesiones + colas)
  └── pago-ya-db       → PostgreSQL 16
```

Todos los servicios se comunican mediante la **red privada** de Render
(no salen a Internet entre sí).

---

## Paso 1 — Crear cuenta y workspace en Render

1. Ve a <https://dashboard.render.com> y crea una cuenta (o inicia sesión).
2. Conecta tu cuenta de **GitHub** desde **Account Settings → Git Providers**.

---

## Paso 2 — Aplicar el Blueprint

1. En el dashboard, haz clic en **New → Blueprint**.
2. Selecciona el repositorio `pago-ya` (o el nombre que tenga en tu cuenta).
3. Render detectará automáticamente el archivo `render.yaml` en la raíz.
4. Haz clic en **Apply**.

Durante la creación, Render te pedirá los valores de las variables marcadas
con `sync: false`:

| Variable | Descripción |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram (`@BotFather`) |
| `TELEGRAM_CHAT_ID` | ID del chat/canal donde llegan las notificaciones |
| `CORS_ORIGIN` | URL pública del servicio, p.ej. `https://pago-ya-web.onrender.com` |

> Las variables con `generateValue: true` (`JWT_SECRET`, `SESSION_SECRET`, etc.)
> se generan automáticamente — no necesitas hacer nada.

---

## Paso 3 — Verificar el primer despliegue

Una vez aplicado el Blueprint, Render:

1. Crea la base de datos PostgreSQL y el Key Value (Redis).
2. Lanza el build del Web Service:
   - `npm install`
   - `npm run build:css`
   - `npm run db:generate` (genera Prisma Client)
3. Ejecuta el pre-deploy: `npm run db:migrate:prod` (aplica migraciones).
4. Inicia la app: `npm start`.

Puedes seguir el progreso en **Dashboard → pago-ya-web → Logs**.

El health check en `/api/health` confirma que el servicio está listo antes
de enrutar tráfico (zero-downtime deploy).

---

## Paso 4 — Auto-deploy en cada push a `main`

Ya está configurado en `render.yaml`:

```yaml
branch: main
autoDeployTrigger: commit
```

Flujo completo:

```
git push origin main
      │
      ▼
GitHub notifica a Render
      │
      ▼
Render: build → pre-deploy (migraciones) → swap (zero-downtime)
```

Si el build o las migraciones fallan, Render **no reemplaza** la versión
en producción — tu app sigue corriendo sin interrupciones.

---

## Paso 5 — Gestionar variables de entorno después del deploy

Para agregar o cambiar secretos manualmente:

1. Dashboard → **pago-ya-web** → **Environment**.
2. Agrega/edita la variable.
3. Haz clic en **Save Changes** → Render redespliega automáticamente.

---

## Variables de entorno de referencia

| Variable | Fuente | Notas |
|---|---|---|
| `DATABASE_URL` | Auto (Blueprint) | String de conexión PostgreSQL interna |
| `REDIS_URL` | Auto (Blueprint) | String de conexión Key Value interna |
| `JWT_SECRET` | Auto (generado) | 256-bit aleatorio al crear el Blueprint |
| `JWT_EXPIRES_IN` | `render.yaml` | `8h` por defecto |
| `JWT_REFRESH_SECRET` | Auto (generado) | 256-bit aleatorio |
| `SESSION_SECRET` | Auto (generado) | 256-bit aleatorio |
| `TELEGRAM_BOT_TOKEN` | Manual | Pedido en el formulario de creación |
| `TELEGRAM_CHAT_ID` | Manual | Pedido en el formulario de creación |
| `CORS_ORIGIN` | Manual | URL pública: `https://pago-ya-web.onrender.com` |
| `USURY_RATE_ANNUAL` | `render.yaml` | `0.36` — ajustar según regulación |
| `DEFAULT_MORA_RATE_ANNUAL` | `render.yaml` | `0.12` |
| `NODE_ENV` | `render.yaml` | `production` |

---

## Desarrollo local — sin cambios

Para desarrollo local sigue usando `.env` con las variables originales
(`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`). El cliente Redis detecta
automáticamente si existe `REDIS_URL` (producción) o las variables separadas
(desarrollo).

```env
# .env (desarrollo local)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=   ← vacío en local
```

---

## Rollbacks

Si necesitas volver a una versión anterior:

Dashboard → **pago-ya-web** → **Events** → selecciona el deploy anterior
→ **Rollback to this deploy**.

---

## Escalado

Para subir de plan (más CPU/RAM), edita `render.yaml`:

```yaml
plan: standard   # free → starter → standard → pro
```

Y haz push a `main`. El Blueprint se sincroniza automáticamente.
