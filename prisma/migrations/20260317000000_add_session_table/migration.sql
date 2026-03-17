-- Tabla requerida por connect-pg-simple para persistir sesiones en PostgreSQL.
-- No es un modelo Prisma; se gestiona manualmente con createTableIfMissing: false
-- para evitar que connect-pg-simple necesite permisos DDL en tiempo de ejecución.
-- ADD CONSTRAINT IF NOT EXISTS no existe en PostgreSQL — se usa DO $$ para idempotencia.
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar       NOT NULL COLLATE "default",
  "sess"   json          NOT NULL,
  "expire" timestamp(6)  NOT NULL
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
  ) THEN
    ALTER TABLE "session"
      ADD CONSTRAINT "session_pkey"
      PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
