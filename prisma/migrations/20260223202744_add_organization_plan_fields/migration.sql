-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "logo_url" VARCHAR(500),
ADD COLUMN     "mora_grace_days" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "mora_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.5,
ADD COLUMN     "plan_type" VARCHAR(20) NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "subscription_ends" DATE;
