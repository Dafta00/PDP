import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { ResourceTransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsEnum(ResourceTransactionType)
  type!: ResourceTransactionType;

  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
