import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { CampaignActivityType } from '@prisma/client';
import { CampaignScopeDto } from './campaign-scope.dto';

export class CreateCampaignActivityDto extends CampaignScopeDto {
  @IsEnum(CampaignActivityType)
  type!: CampaignActivityType;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentUrls?: string[];
}
