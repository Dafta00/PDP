import { IsOptional, IsString } from 'class-validator';

export class VerifyMemberDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  membershipId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
