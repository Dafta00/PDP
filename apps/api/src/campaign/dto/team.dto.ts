import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignTeamStatus } from '@prisma/client';
import { CampaignScopeDto } from './campaign-scope.dto';

export class CreateCampaignTeamDto extends CampaignScopeDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  teamType?: string;

  @IsOptional()
  @IsString()
  coordinatorId?: string;
}

export class UpdateCampaignTeamDto extends CampaignScopeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  teamType?: string;

  @IsOptional()
  @IsString()
  coordinatorId?: string;

  @IsOptional()
  @IsEnum(CampaignTeamStatus)
  status?: CampaignTeamStatus;
}

export class AddTeamMemberDto {
  @IsOptional()
  @IsString()
  membershipId?: string;

  @IsOptional()
  @IsString()
  volunteerId?: string;

  @IsOptional()
  @IsString()
  roleInTeam?: string;
}
