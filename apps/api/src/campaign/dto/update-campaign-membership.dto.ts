import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignRole, CampaignMembershipStatus } from '@prisma/client';

export class UpdateCampaignMembershipDto {
  @IsOptional()
  @IsEnum(CampaignRole)
  role?: CampaignRole;

  @IsOptional()
  @IsEnum(CampaignMembershipStatus)
  status?: CampaignMembershipStatus;

  @IsOptional()
  @IsString()
  senatorialDistrictId?: string;

  @IsOptional()
  @IsString()
  lgaId?: string;

  @IsOptional()
  @IsString()
  wardId?: string;

  @IsOptional()
  @IsString()
  pollingUnitId?: string;
}
