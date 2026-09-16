import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEnum(Role)
  role!: Role;

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

  /**
   * Grants a POLLING_UNIT_OFFICER permission to create DATA_ENTRY_OFFICER
   * accounts. Only honored when the actor is SUPER_ADMIN and `role` is
   * POLLING_UNIT_OFFICER — silently ignored otherwise (see UsersService).
   */
  @IsOptional()
  @IsBoolean()
  canCreateUsers?: boolean;
}
