import { IsOptional, IsString } from 'class-validator';

/** Shared optional geographic-scope fields, extended by most campaign entity DTOs. */
export class CampaignScopeDto {
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
