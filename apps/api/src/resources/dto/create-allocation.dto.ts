import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum AllocationTargetLevel {
  LGA = 'LGA',
  WARD = 'WARD',
  POLLING_UNIT = 'POLLING_UNIT',
}

export class CreateAllocationDto {
  @IsString()
  resourceId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsEnum(AllocationTargetLevel)
  targetLevel!: AllocationTargetLevel;

  @IsString()
  targetId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
