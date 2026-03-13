-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'COLLECTOR');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AmortizationType" AS ENUM ('FIXED', 'DECLINING_BALANCE');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('CLIENT_ABSENT', 'PARTIAL_PAYMENT', 'REFUSED_PAYMENT', 'ADDRESS_NOT_FOUND', 'OTHER');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "nit" VARCHAR(20),
    "phone" VARCHAR(20),
    "email" VARCHAR(100),
    "address" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'COLLECTOR',
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20),
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "route_id" UUID,
    "first_name" VARCHAR(80) NOT NULL,
    "last_name" VARCHAR(80) NOT NULL,
    "document_type" VARCHAR(10) NOT NULL DEFAULT 'CC',
    "document_number" VARCHAR(30) NOT NULL,
    "phone" VARCHAR(20),
    "address" VARCHAR(255),
    "business_name" VARCHAR(150),
    "business_address" VARCHAR(255),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "collector_id" UUID,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "collector_id" UUID NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'PENDING',
    "amortization_type" "AmortizationType" NOT NULL DEFAULT 'FIXED',
    "payment_frequency" "PaymentFrequency" NOT NULL DEFAULT 'DAILY',
    "principal_amount" DECIMAL(14,2) NOT NULL,
    "interest_rate" DECIMAL(6,4) NOT NULL,
    "total_amount" DECIMAL(14,2) NOT NULL,
    "installment_amount" DECIMAL(14,2) NOT NULL,
    "total_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outstanding_balance" DECIMAL(14,2) NOT NULL,
    "mora_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "number_of_payments" INTEGER NOT NULL,
    "paid_payments" INTEGER NOT NULL DEFAULT 0,
    "disbursement_date" DATE NOT NULL,
    "expected_end_date" DATE NOT NULL,
    "actual_end_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_schedules" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "amount_due" DECIMAL(14,2) NOT NULL,
    "principal_due" DECIMAL(14,2) NOT NULL,
    "interest_due" DECIMAL(14,2) NOT NULL,
    "amount_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "mora_charged" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "payment_schedule_id" UUID,
    "collector_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mora_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_received" DECIMAL(14,2) NOT NULL,
    "payment_method" VARCHAR(20) NOT NULL DEFAULT 'CASH',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "notes" TEXT,
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "collector_id" UUID NOT NULL,
    "type" "IncidentType" NOT NULL,
    "description" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "photo_url" VARCHAR(500),
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gps_locations" (
    "id" UUID NOT NULL,
    "collector_id" UUID NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "accuracy" DECIMAL(8,2),
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gps_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_nit_key" ON "organizations"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "clients_route_id_idx" ON "clients"("route_id");

-- CreateIndex
CREATE INDEX "clients_document_number_idx" ON "clients"("document_number");

-- CreateIndex
CREATE UNIQUE INDEX "clients_document_type_document_number_key" ON "clients"("document_type", "document_number");

-- CreateIndex
CREATE INDEX "routes_organization_id_idx" ON "routes"("organization_id");

-- CreateIndex
CREATE INDEX "routes_collector_id_idx" ON "routes"("collector_id");

-- CreateIndex
CREATE INDEX "loans_organization_id_idx" ON "loans"("organization_id");

-- CreateIndex
CREATE INDEX "loans_client_id_idx" ON "loans"("client_id");

-- CreateIndex
CREATE INDEX "loans_collector_id_idx" ON "loans"("collector_id");

-- CreateIndex
CREATE INDEX "loans_status_idx" ON "loans"("status");

-- CreateIndex
CREATE INDEX "loans_disbursement_date_idx" ON "loans"("disbursement_date");

-- CreateIndex
CREATE INDEX "payment_schedules_loan_id_idx" ON "payment_schedules"("loan_id");

-- CreateIndex
CREATE INDEX "payment_schedules_due_date_idx" ON "payment_schedules"("due_date");

-- CreateIndex
CREATE INDEX "payment_schedules_is_paid_idx" ON "payment_schedules"("is_paid");

-- CreateIndex
CREATE UNIQUE INDEX "payment_schedules_loan_id_installment_number_key" ON "payment_schedules"("loan_id", "installment_number");

-- CreateIndex
CREATE INDEX "payments_loan_id_idx" ON "payments"("loan_id");

-- CreateIndex
CREATE INDEX "payments_payment_schedule_id_idx" ON "payments"("payment_schedule_id");

-- CreateIndex
CREATE INDEX "payments_collector_id_idx" ON "payments"("collector_id");

-- CreateIndex
CREATE INDEX "payments_collected_at_idx" ON "payments"("collected_at");

-- CreateIndex
CREATE INDEX "incidents_loan_id_idx" ON "incidents"("loan_id");

-- CreateIndex
CREATE INDEX "incidents_collector_id_idx" ON "incidents"("collector_id");

-- CreateIndex
CREATE INDEX "incidents_reported_at_idx" ON "incidents"("reported_at");

-- CreateIndex
CREATE INDEX "gps_locations_collector_id_idx" ON "gps_locations"("collector_id");

-- CreateIndex
CREATE INDEX "gps_locations_recorded_at_idx" ON "gps_locations"("recorded_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_schedule_id_fkey" FOREIGN KEY ("payment_schedule_id") REFERENCES "payment_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gps_locations" ADD CONSTRAINT "gps_locations_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
