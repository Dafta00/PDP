-- AlterTable
ALTER TABLE "User" ADD COLUMN     "senatorialDistrictId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_senatorialDistrictId_fkey" FOREIGN KEY ("senatorialDistrictId") REFERENCES "SenatorialDistrict"("id") ON DELETE SET NULL ON UPDATE CASCADE;
