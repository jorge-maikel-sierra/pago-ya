-- Migration: add_payment_split_fields
-- Adds fields required by the payment-split engine:
--   • payments.principal_applied  — capital portion of each payment
--   • payments.interest_applied   — interest portion of each payment
--   • payments.payment_type       — engine classification (FULL, PARTIAL_INTEREST, etc.)
--   • payment_schedules.is_restructured — marks installments replaced by early capital payments

-- AlterTable payments
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "principal_applied" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "interest_applied"  DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "payment_type"      VARCHAR(20) DEFAULT 'FULL';

-- AlterTable payment_schedules
ALTER TABLE "payment_schedules"
  ADD COLUMN IF NOT EXISTS "is_restructured" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex for is_restructured to speed up pending-schedule queries in processPayment
CREATE INDEX IF NOT EXISTS "payment_schedules_is_restructured_idx"
  ON "payment_schedules"("is_restructured");
