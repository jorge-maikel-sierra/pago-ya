/*
  Warnings:

  - A unique constraint covering the columns `[organization_id,document_type,document_number]` on the table `clients` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "clients_document_type_document_number_key";

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "city" VARCHAR(100) NOT NULL DEFAULT 'Riohacha',
ADD COLUMN     "credit_score" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "neighborhood" VARCHAR(100),
ADD COLUMN     "organization_id" UUID,
ADD COLUMN     "reference_contact" VARCHAR(100),
ADD COLUMN     "reference_phone" VARCHAR(20);

-- CreateIndex
CREATE INDEX "clients_organization_id_idx" ON "clients"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "clients_organization_id_document_type_document_number_key" ON "clients"("organization_id", "document_type", "document_number");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
