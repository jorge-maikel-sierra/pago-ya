## PostgreSQL — Checklist de configuración y verificación

Sigue estos pasos antes de correr la app para asegurar una conexión segura y funcional.

### 1) Crear rol con contraseña y base de datos
```bash
psql -h localhost -U postgres
-- Dentro de psql:
CREATE ROLE pago_ya WITH LOGIN PASSWORD 'cambia-esta-clave';
CREATE DATABASE pago_ya OWNER pago_ya;
```
> Si el rol ya existe, solo refuerza la contraseña con `\\password pago_ya`.

### 2) Configurar `.env`
En la raíz duplica `.env.example` a `.env` y define:
```bash
DATABASE_URL=postgresql://pago_ya:<clave>@localhost:5432/pago_ya?schema=public
DIRECT_URL=postgresql://pago_ya:<clave>@localhost:5432/pago_ya?schema=public
```
No dejes la contraseña vacía ni uses autenticación trust.

### 3) Probar la conexión
Con la base arriba (por ejemplo `brew services start postgresql@16`):
```bash
psql "$DATABASE_URL" -c "select 1;"
```
Debe responder `?column? | 1`.

### 4) Migraciones y seed (opcional)
```bash
npm run prisma:migrate:dev   # aplica schema a la BD apuntando a DATABASE_URL
npm run prisma:seed          # solo en entornos de desarrollo
```

### 5) Producción / cloud
- Mantén `DATABASE_URL` y `DIRECT_URL` como secrets del entorno (no hardcode).
- Usa roles con contraseña fuerte y `sslmode=require` si el proveedor lo exige.
