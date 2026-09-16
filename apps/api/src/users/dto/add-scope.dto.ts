import { IsOptional, IsString } from 'class-validator';

export class AddScopeDto {
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
