import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { CampaignTaskPriority, CampaignTaskStatus } from '@prisma/client';
import { CampaignScopeDto } from './campaign-scope.dto';

export class CreateCampaignTaskDto extends CampaignScopeDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assignedToMembershipId?: string;

  @IsOptional()
  @IsString()
  assignedToTeamId?: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsEnum(CampaignTaskPriority)
  priority?: CampaignTaskPriority;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}

export class UpdateCampaignTaskDto extends CampaignScopeDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  assignedToMembershipId?: string;

  @IsOptional()
  @IsString()
  assignedToTeamId?: string;

  @IsOptional()
  @IsEnum(CampaignTaskPriority)
  priority?: CampaignTaskPriority;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsEnum(CampaignTaskStatus)
  status?: CampaignTaskStatus;
}
