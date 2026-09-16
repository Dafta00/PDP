import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { CampaignStatus } from '@prisma/client';

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  candidateName?: string;

  @IsOptional()
  @IsString()
  candidateTitle?: string;

  @IsOptional()
  @IsString()
  candidateBio?: string;

  @IsOptional()
  @IsString()
  candidatePhotoUrl?: string;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
