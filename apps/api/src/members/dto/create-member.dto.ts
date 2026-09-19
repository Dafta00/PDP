import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EducationLevel, Gender } from '@prisma/client';
import { IsNigerianPhone } from '../../common/validators/is-nigerian-phone.decorator';

export class CreateMemberDto {
  @IsString()
  @MinLength(2)
  firstName!: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  @MinLength(2)
  surname!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsISO8601()
  dateOfBirth!: string;

  @IsString()
  @IsNigerianPhone()
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  // Only meaningful (and required) when educationLevel is OTHER — keeps the
  // structured field closed while still allowing a one-line specification.
  @ValidateIf((dto) => dto.educationLevel === EducationLevel.OTHER)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  educationLevelOther?: string;

  // National Identification Number — exactly 11 digits. Never logged or
  // returned in plaintext to anyone but a SUPER_ADMIN (see members.service.ts
  // and AuthorizationService.canViewMemberNIN). Optional at the DTO level so
  // legacy-style registrations without an NIN on hand can still proceed.
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'NIN must be exactly 11 digits.' })
  nin?: string;

  // Permanent Voter's Card identification number (the alphanumeric code
  // printed on the PVC) — a unique identifier, not NIN-tier sensitive.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9]{5,25}$/, {
    message: 'PVC identifier must be 5-25 letters/numbers.',
  })
  pvcNumber?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsString()
  pollingUnitId!: string;
}
