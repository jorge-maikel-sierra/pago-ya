-- AlterTable: agrega la columna interest_paid que faltaba en el schema pero no tenía migración
ALTER TABLE "loans" ADD COLUMN "interest_paid" DECIMAL(14,2) NOT NULL DEFAULT 0;
