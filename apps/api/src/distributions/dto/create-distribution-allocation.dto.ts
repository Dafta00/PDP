import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AllocationTargetLevel } from '../../resources/dto/create-allocation.dto';

export class CreateDistributionAllocationDto {
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
