import { IsArray, IsEnum, IsISO8601, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CampaignEventStatus, CampaignEventType } from '@prisma/client';
import { CampaignScopeDto } from './campaign-scope.dto';

export class CreateCampaignEventDto extends CampaignScopeDto {
  @IsString()
  title!: string;

  @IsEnum(CampaignEventType)
  type!: CampaignEventType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsISO8601()
  date!: string;

  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedAttendance?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];
}

export class UpdateCampaignEventDto extends CampaignScopeDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(CampaignEventType)
  type?: CampaignEventType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedAttendance?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualAttendance?: number;

  @IsOptional()
  @IsEnum(CampaignEventStatus)
  status?: CampaignEventStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];
}
