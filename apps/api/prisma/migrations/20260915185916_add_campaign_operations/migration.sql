-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('PLANNED', 'ACTIVE', 'SUSPENDED', 'CONCLUDED');

-- CreateEnum
CREATE TYPE "CampaignRole" AS ENUM ('CAMPAIGN_SUPER_ADMIN', 'STATE_CAMPAIGN_COORDINATOR', 'DISTRICT_COORDINATOR', 'LGA_COORDINATOR', 'WARD_COORDINATOR', 'POLLING_UNIT_COORDINATOR', 'CAMPAIGN_DATA_OFFICER', 'EVENT_COORDINATOR', 'LOGISTICS_OFFICER', 'VOLUNTEER_COORDINATOR', 'REPORT_VIEWER');

-- CreateEnum
CREATE TYPE "CampaignMembershipStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "CampaignTeamStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CampaignVolunteerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CampaignEventType" AS ENUM ('RALLY', 'TOWN_HALL', 'WARD_MEETING', 'LGA_MEETING', 'DISTRICT_MEETING', 'STAKEHOLDER_MEETING', 'VOLUNTEER_TRAINING', 'COMMUNITY_OUTREACH', 'INTERNAL_PARTY_MEETING');

-- CreateEnum
CREATE TYPE "CampaignEventStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'POSTPONED');

-- CreateEnum
CREATE TYPE "CampaignAttendeeType" AS ENUM ('MEMBER', 'VOLUNTEER', 'GUEST');

-- CreateEnum
CREATE TYPE "CampaignAttendanceStatus" AS ENUM ('CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "CampaignTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CampaignTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignActivityType" AS ENUM ('MEETING_HELD', 'EVENT_COMPLETED', 'TEAM_CREATED', 'VOLUNTEER_ASSIGNED', 'RESOURCE_ALLOCATED', 'TASK_COMPLETED', 'GENERAL');

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "candidateTitle" TEXT,
    "candidateBio" TEXT,
    "candidatePhotoUrl" TEXT,
    "party" TEXT NOT NULL,
    "electionType" TEXT NOT NULL,
    "electionYear" INTEGER NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "stateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMembership" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CampaignRole" NOT NULL,
    "status" "CampaignMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "senatorialDistrictId" TEXT,
    "lgaId" TEXT,
    "wardId" TEXT,
    "pollingUnitId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRolePermission" (
    "id" TEXT NOT NULL,
    "role" "CampaignRole" NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "CampaignRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMembershipPermission" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignMembershipPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTeam" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamType" TEXT,
    "status" "CampaignTeamStatus" NOT NULL DEFAULT 'ACTIVE',
    "senatorialDistrictId" TEXT,
    "lgaId" TEXT,
    "wardId" TEXT,
    "pollingUnitId" TEXT,
    "coordinatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "membershipId" TEXT,
    "volunteerId" TEXT,
    "roleInTeam" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignVolunteer" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "memberId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT,
    "status" "CampaignVolunteerStatus" NOT NULL DEFAULT 'ACTIVE',
    "availability" TEXT,
    "senatorialDistrictId" TEXT,
    "lgaId" TEXT,
    "wardId" TEXT,
    "pollingUnitId" TEXT,
    "coordinatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignVolunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CampaignEventType" NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "venue" TEXT,
    "senatorialDistrictId" TEXT,
    "lgaId" TEXT,
    "wardId" TEXT,
    "pollingUnitId" TEXT,
    "organizerId" TEXT NOT NULL,
    "expectedAttendance" INTEGER,
    "actualAttendance" INTEGER,
    "status" "CampaignEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attachmentUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAttendance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attendeeType" "CampaignAttendeeType" NOT NULL,
    "memberId" TEXT,
    "volunteerId" TEXT,
    "guestName" TEXT,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutAt" TIMESTAMP(3),
    "status" "CampaignAttendanceStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "verificationMethod" "VerificationMethod" NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignTask" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedToMembershipId" TEXT,
    "assignedToTeamId" TEXT,
    "eventId" TEXT,
    "senatorialDistrictId" TEXT,
    "lgaId" TEXT,
    "wardId" TEXT,
    "pollingUnitId" TEXT,
    "priority" "CampaignTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "status" "CampaignTaskStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignActivity" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "CampaignActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senatorialDistrictId" TEXT,
    "lgaId" TEXT,
    "wardId" TEXT,
    "pollingUnitId" TEXT,
    "responsibleId" TEXT,
    "teamId" TEXT,
    "eventId" TEXT,
    "attachmentUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignMembership_campaignId_role_idx" ON "CampaignMembership"("campaignId", "role");

-- CreateIndex
CREATE INDEX "CampaignMembership_senatorialDistrictId_idx" ON "CampaignMembership"("senatorialDistrictId");

-- CreateIndex
CREATE INDEX "CampaignMembership_lgaId_idx" ON "CampaignMembership"("lgaId");

-- CreateIndex
CREATE INDEX "CampaignMembership_wardId_idx" ON "CampaignMembership"("wardId");

-- CreateIndex
CREATE INDEX "CampaignMembership_pollingUnitId_idx" ON "CampaignMembership"("pollingUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMembership_campaignId_userId_key" ON "CampaignMembership"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "CampaignRolePermission_role_idx" ON "CampaignRolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRolePermission_role_permission_key" ON "CampaignRolePermission"("role", "permission");

-- CreateIndex
CREATE INDEX "CampaignMembershipPermission_membershipId_idx" ON "CampaignMembershipPermission"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMembershipPermission_membershipId_permission_key" ON "CampaignMembershipPermission"("membershipId", "permission");

-- CreateIndex
CREATE INDEX "CampaignTeam_campaignId_idx" ON "CampaignTeam"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignTeam_senatorialDistrictId_idx" ON "CampaignTeam"("senatorialDistrictId");

-- CreateIndex
CREATE INDEX "CampaignTeam_lgaId_idx" ON "CampaignTeam"("lgaId");

-- CreateIndex
CREATE INDEX "CampaignTeam_wardId_idx" ON "CampaignTeam"("wardId");

-- CreateIndex
CREATE INDEX "CampaignTeam_pollingUnitId_idx" ON "CampaignTeam"("pollingUnitId");

-- CreateIndex
CREATE INDEX "CampaignTeamMember_teamId_idx" ON "CampaignTeamMember"("teamId");

-- CreateIndex
CREATE INDEX "CampaignVolunteer_campaignId_idx" ON "CampaignVolunteer"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignVolunteer_memberId_idx" ON "CampaignVolunteer"("memberId");

-- CreateIndex
CREATE INDEX "CampaignVolunteer_senatorialDistrictId_idx" ON "CampaignVolunteer"("senatorialDistrictId");

-- CreateIndex
CREATE INDEX "CampaignVolunteer_lgaId_idx" ON "CampaignVolunteer"("lgaId");

-- CreateIndex
CREATE INDEX "CampaignVolunteer_wardId_idx" ON "CampaignVolunteer"("wardId");

-- CreateIndex
CREATE INDEX "CampaignVolunteer_pollingUnitId_idx" ON "CampaignVolunteer"("pollingUnitId");

-- CreateIndex
CREATE INDEX "CampaignEvent_campaignId_status_idx" ON "CampaignEvent"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignEvent_date_idx" ON "CampaignEvent"("date");

-- CreateIndex
CREATE INDEX "CampaignEvent_senatorialDistrictId_idx" ON "CampaignEvent"("senatorialDistrictId");

-- CreateIndex
CREATE INDEX "CampaignEvent_lgaId_idx" ON "CampaignEvent"("lgaId");

-- CreateIndex
CREATE INDEX "CampaignEvent_wardId_idx" ON "CampaignEvent"("wardId");

-- CreateIndex
CREATE INDEX "CampaignEvent_pollingUnitId_idx" ON "CampaignEvent"("pollingUnitId");

-- CreateIndex
CREATE INDEX "CampaignAttendance_eventId_idx" ON "CampaignAttendance"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAttendance_eventId_memberId_key" ON "CampaignAttendance"("eventId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAttendance_eventId_volunteerId_key" ON "CampaignAttendance"("eventId", "volunteerId");

-- CreateIndex
CREATE INDEX "CampaignTask_campaignId_status_idx" ON "CampaignTask"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CampaignTask_senatorialDistrictId_idx" ON "CampaignTask"("senatorialDistrictId");

-- CreateIndex
CREATE INDEX "CampaignTask_lgaId_idx" ON "CampaignTask"("lgaId");

-- CreateIndex
CREATE INDEX "CampaignTask_wardId_idx" ON "CampaignTask"("wardId");

-- CreateIndex
CREATE INDEX "CampaignTask_pollingUnitId_idx" ON "CampaignTask"("pollingUnitId");

-- CreateIndex
CREATE INDEX "CampaignActivity_campaignId_type_idx" ON "CampaignActivity"("campaignId", "type");

-- CreateIndex
CREATE INDEX "CampaignActivity_senatorialDistrictId_idx" ON "CampaignActivity"("senatorialDistrictId");

-- CreateIndex
CREATE INDEX "CampaignActivity_lgaId_idx" ON "CampaignActivity"("lgaId");

-- CreateIndex
CREATE INDEX "CampaignActivity_wardId_idx" ON "CampaignActivity"("wardId");

-- CreateIndex
CREATE INDEX "CampaignActivity_pollingUnitId_idx" ON "CampaignActivity"("pollingUnitId");

-- CreateIndex
CREATE INDEX "Resource_campaignId_idx" ON "Resource"("campaignId");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "State"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_senatorialDistrictId_fkey" FOREIGN KEY ("senatorialDistrictId") REFERENCES "SenatorialDistrict"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "LGA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_pollingUnitId_fkey" FOREIGN KEY ("pollingUnitId") REFERENCES "PollingUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembership" ADD CONSTRAINT "CampaignMembership_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembershipPermission" ADD CONSTRAINT "CampaignMembershipPermission_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CampaignMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMembershipPermission" ADD CONSTRAINT "CampaignMembershipPermission_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTeam" ADD CONSTRAINT "CampaignTeam_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTeam" ADD CONSTRAINT "CampaignTeam_senatorialDistrictId_fkey" FOREIGN KEY ("senatorialDistrictId") REFERENCES "SenatorialDistrict"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTeam" ADD CONSTRAINT "CampaignTeam_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "LGA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTeam" ADD CONSTRAINT "CampaignTeam_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTeam" ADD CONSTRAINT "CampaignTeam_pollingUnitId_fkey" FOREIGN KEY ("pollingUnitId") REFERENCES "PollingUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTeam" ADD CONSTRAINT "CampaignTeam_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "CampaignMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTeamMember" ADD CONSTRAINT "CampaignTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "CampaignTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTeamMember" ADD CONSTRAINT "CampaignTeamMember_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CampaignMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTeamMember" ADD CONSTRAINT "CampaignTeamMember_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "CampaignVolunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVolunteer" ADD CONSTRAINT "CampaignVolunteer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVolunteer" ADD CONSTRAINT "CampaignVolunteer_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVolunteer" ADD CONSTRAINT "CampaignVolunteer_senatorialDistrictId_fkey" FOREIGN KEY ("senatorialDistrictId") REFERENCES "SenatorialDistrict"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVolunteer" ADD CONSTRAINT "CampaignVolunteer_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "LGA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVolunteer" ADD CONSTRAINT "CampaignVolunteer_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVolunteer" ADD CONSTRAINT "CampaignVolunteer_pollingUnitId_fkey" FOREIGN KEY ("pollingUnitId") REFERENCES "PollingUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignVolunteer" ADD CONSTRAINT "CampaignVolunteer_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "CampaignMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_senatorialDistrictId_fkey" FOREIGN KEY ("senatorialDistrictId") REFERENCES "SenatorialDistrict"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "LGA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_pollingUnitId_fkey" FOREIGN KEY ("pollingUnitId") REFERENCES "PollingUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignEvent" ADD CONSTRAINT "CampaignEvent_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "CampaignMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAttendance" ADD CONSTRAINT "CampaignAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CampaignEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAttendance" ADD CONSTRAINT "CampaignAttendance_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAttendance" ADD CONSTRAINT "CampaignAttendance_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "CampaignVolunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAttendance" ADD CONSTRAINT "CampaignAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "CampaignMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_assignedToMembershipId_fkey" FOREIGN KEY ("assignedToMembershipId") REFERENCES "CampaignMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_assignedToTeamId_fkey" FOREIGN KEY ("assignedToTeamId") REFERENCES "CampaignTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CampaignEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_senatorialDistrictId_fkey" FOREIGN KEY ("senatorialDistrictId") REFERENCES "SenatorialDistrict"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "LGA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_pollingUnitId_fkey" FOREIGN KEY ("pollingUnitId") REFERENCES "PollingUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "CampaignMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTask" ADD CONSTRAINT "CampaignTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "CampaignMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivity" ADD CONSTRAINT "CampaignActivity_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivity" ADD CONSTRAINT "CampaignActivity_senatorialDistrictId_fkey" FOREIGN KEY ("senatorialDistrictId") REFERENCES "SenatorialDistrict"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivity" ADD CONSTRAINT "CampaignActivity_lgaId_fkey" FOREIGN KEY ("lgaId") REFERENCES "LGA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivity" ADD CONSTRAINT "CampaignActivity_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivity" ADD CONSTRAINT "CampaignActivity_pollingUnitId_fkey" FOREIGN KEY ("pollingUnitId") REFERENCES "PollingUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivity" ADD CONSTRAINT "CampaignActivity_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "CampaignMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivity" ADD CONSTRAINT "CampaignActivity_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "CampaignTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivity" ADD CONSTRAINT "CampaignActivity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CampaignEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
