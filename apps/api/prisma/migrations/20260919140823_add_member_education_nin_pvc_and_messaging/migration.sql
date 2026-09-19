-- Additive only: all new Member columns are nullable, so every existing
-- member row remains valid with NULL education/NIN/PVC values. No existing
-- column is altered, renamed, or dropped, and no data is deleted or reset.
-- NIN is never stored in plaintext (see ninEncrypted/ninHash comments in
-- schema.prisma); pvcNumber is a normalized plain unique string, matching
-- the existing membershipId/email convention.

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('NO_FORMAL_EDUCATION', 'PRIMARY', 'SECONDARY', 'NCE', 'ND', 'HND', 'BACHELORS_DEGREE', 'POSTGRADUATE_DIPLOMA', 'MASTERS_DEGREE', 'PHD', 'OTHER');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "educationLevel" "EducationLevel",
ADD COLUMN     "educationLevelOther" TEXT,
ADD COLUMN     "ninEncrypted" TEXT,
ADD COLUMN     "ninHash" TEXT,
ADD COLUMN     "pvcNumber" TEXT;

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "parentMessageId" TEXT,
    "readAt" TIMESTAMP(3),
    "deletedBySender" BOOLEAN NOT NULL DEFAULT false,
    "deletedByRecipient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_recipientId_idx" ON "Message"("recipientId");

-- CreateIndex
CREATE INDEX "Message_recipientId_readAt_idx" ON "Message"("recipientId", "readAt");

-- CreateIndex
CREATE INDEX "Message_parentMessageId_idx" ON "Message"("parentMessageId");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageAttachment_storedFileName_key" ON "MessageAttachment"("storedFileName");

-- CreateIndex
CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_ninHash_key" ON "Member"("ninHash");

-- CreateIndex
CREATE UNIQUE INDEX "Member_pvcNumber_key" ON "Member"("pvcNumber");

-- CreateIndex
CREATE INDEX "Member_educationLevel_idx" ON "Member"("educationLevel");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

