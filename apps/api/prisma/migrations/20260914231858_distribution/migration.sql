/*
  Warnings:

  - Changed the type of `method` on the `Attendance` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- Rename in place rather than drop+recreate, so existing Attendance rows
-- (and their `method` values) survive the enum rename untouched.
ALTER TYPE "AttendanceMethod" RENAME TO "VerificationMethod";

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('CONFIRMED', 'REVERSED');

-- AlterTable
ALTER TABLE "ResourceAllocation" ADD COLUMN     "distributionId" TEXT;

-- CreateTable
CREATE TABLE "Distribution" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "resourceId" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'DRAFT',
    "organizerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionReceipt" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "method" "VerificationMethod" NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'CONFIRMED',
    "officerId" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Distribution_resourceId_idx" ON "Distribution"("resourceId");

-- CreateIndex
CREATE INDEX "Distribution_status_idx" ON "Distribution"("status");

-- CreateIndex
CREATE INDEX "DistributionReceipt_distributionId_idx" ON "DistributionReceipt"("distributionId");

-- CreateIndex
CREATE INDEX "DistributionReceipt_memberId_idx" ON "DistributionReceipt"("memberId");

-- CreateIndex
CREATE INDEX "DistributionReceipt_allocationId_idx" ON "DistributionReceipt"("allocationId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionReceipt_distributionId_memberId_key" ON "DistributionReceipt"("distributionId", "memberId");

-- CreateIndex
CREATE INDEX "ResourceAllocation_distributionId_idx" ON "ResourceAllocation"("distributionId");

-- AddForeignKey
ALTER TABLE "ResourceAllocation" ADD CONSTRAINT "ResourceAllocation_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Distribution" ADD CONSTRAINT "Distribution_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionReceipt" ADD CONSTRAINT "DistributionReceipt_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "Distribution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionReceipt" ADD CONSTRAINT "DistributionReceipt_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "ResourceAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionReceipt" ADD CONSTRAINT "DistributionReceipt_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionReceipt" ADD CONSTRAINT "DistributionReceipt_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionReceipt" ADD CONSTRAINT "DistributionReceipt_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
