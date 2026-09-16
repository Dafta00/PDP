import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignRole } from '@prisma/client';

export class CreateCampaignMembershipDto {
  @IsString()
  userId!: string;

  @IsEnum(CampaignRole)
  role!: CampaignRole;

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
