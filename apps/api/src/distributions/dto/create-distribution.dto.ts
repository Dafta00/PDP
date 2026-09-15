import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { DistributionStatus } from '@prisma/client';

export class CreateDistributionDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  resourceId!: string;
}

export class UpdateDistributionStatusDto {
  @IsEnum(DistributionStatus)
  status!: DistributionStatus;
}
