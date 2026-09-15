import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MemberStatus } from '@prisma/client';

export class QueryMemberDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @IsOptional()
  @IsString()
  lgaId?: string;

  @IsOptional()
  @IsString()
  wardId?: string;

  @IsOptional()
  @IsString()
  pollingUnitId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

export class UpdateMemberStatusDto {
  @IsEnum(MemberStatus)
  status!: MemberStatus;
}
