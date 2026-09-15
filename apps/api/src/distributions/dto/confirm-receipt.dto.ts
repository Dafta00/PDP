import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ConfirmReceiptDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  membershipId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  /** Explicit allocation to draw from — required for unrestricted admins, optional for scoped officers (auto-resolved to their own unit's allocation). */
  @IsOptional()
  @IsString()
  allocationId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
