-- CreateEnum
CREATE TYPE "OrgUnitStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "LGA" ADD COLUMN     "code" TEXT,
ADD COLUMN     "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "PollingUnit" ADD COLUMN     "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "SenatorialDistrict" ADD COLUMN     "code" TEXT,
ADD COLUMN     "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "State" ADD COLUMN     "code" TEXT,
ADD COLUMN     "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "Ward" ADD COLUMN     "code" TEXT,
ADD COLUMN     "status" "OrgUnitStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "LGA_code_key" ON "LGA"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PollingUnit_code_key" ON "PollingUnit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SenatorialDistrict_stateId_code_key" ON "SenatorialDistrict"("stateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "State_code_key" ON "State"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Ward_code_key" ON "Ward"("code");

