-- Safety migration to ensure recent client fields exist in databases
-- that may not have applied the 20260223230535_add_client_organization_fields migration.

-- city (NOT NULL with default)
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "city" VARCHAR(100) NOT NULL DEFAULT 'Riohacha';

-- neighborhood (nullable)
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "neighborhood" VARCHAR(100);

-- reference contact + phone (nullable)
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "reference_contact" VARCHAR(100);

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "reference_phone" VARCHAR(20);

-- credit score (NOT NULL with default)
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "credit_score" INTEGER NOT NULL DEFAULT 100;

-- organization_id (nullable) to align with schema and filters by organization
ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "organization_id" UUID;

-- Foreign key to organizations (idempotent guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_organization_id_fkey'
  ) THEN
    ALTER TABLE "clients"
      ADD CONSTRAINT "clients_organization_id_fkey"
      FOREIGN KEY ("organization_id")
      REFERENCES "organizations"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- Index for organization_id (idempotent)
CREATE INDEX IF NOT EXISTS "clients_organization_id_idx" ON "clients" ("organization_id");
