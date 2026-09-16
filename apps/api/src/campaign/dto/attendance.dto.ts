import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignAttendeeType, VerificationMethod } from '@prisma/client';

export class RecordCampaignAttendanceDto {
  @IsEnum(CampaignAttendeeType)
  attendeeType!: CampaignAttendeeType;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  volunteerId?: string;

  @IsOptional()
  @IsString()
  guestName?: string;

  @IsOptional()
  @IsEnum(VerificationMethod)
  verificationMethod?: VerificationMethod;
}
