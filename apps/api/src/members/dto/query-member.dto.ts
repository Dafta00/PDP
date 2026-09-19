import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EducationLevel, MemberStatus } from '@prisma/client';

export class QueryMemberDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  // Exact-match lookup only (never a `contains` substring search) — finding
  // the one member who holds a given PVC identifier is a legitimate
  // uniqueness/lookup use case; enumerating PVC values via partial search is
  // not, per the data-minimization requirement on this field.
  @IsOptional()
  @IsString()
  pvcNumber?: string;

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
