import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateResourceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  initialQuantity!: number;

  /** Tags this resource as belonging to a campaign — see Campaign Operations schema note on Resource.campaignId. */
  @IsOptional()
  @IsString()
  campaignId?: string;
}

export class RestockResourceDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
