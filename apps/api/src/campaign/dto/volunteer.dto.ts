import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignVolunteerStatus } from '@prisma/client';
import { CampaignScopeDto } from './campaign-scope.dto';

export class CreateCampaignVolunteerDto extends CampaignScopeDto {
  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  availability?: string;

  @IsOptional()
  @IsString()
  memberId?: string;

  @IsOptional()
  @IsString()
  coordinatorId?: string;
}

export class UpdateCampaignVolunteerDto extends CampaignScopeDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  availability?: string;

  @IsOptional()
  @IsString()
  coordinatorId?: string;

  @IsOptional()
  @IsEnum(CampaignVolunteerStatus)
  status?: CampaignVolunteerStatus;
}
