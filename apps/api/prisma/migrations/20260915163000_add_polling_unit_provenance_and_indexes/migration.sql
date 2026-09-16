-- AlterTable
ALTER TABLE "PollingUnit"
  ADD COLUMN "source" TEXT,
  ADD COLUMN "sourceVersion" TEXT,
  ADD COLUMN "effectiveFrom" TIMESTAMP(3),
  ADD COLUMN "effectiveTo" TIMESTAMP(3),
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "PollingUnit_wardId_idx" ON "PollingUnit"("wardId");

-- CreateIndex
CREATE INDEX "Member_email_idx" ON "Member"("email");

-- CreateIndex
CREATE INDEX "User_senatorialDistrictId_idx" ON "User"("senatorialDistrictId");

-- CreateIndex
CREATE INDEX "User_lgaId_idx" ON "User"("lgaId");

-- CreateIndex
CREATE INDEX "User_wardId_idx" ON "User"("wardId");

-- CreateIndex
CREATE INDEX "User_pollingUnitId_idx" ON "User"("pollingUnitId");
