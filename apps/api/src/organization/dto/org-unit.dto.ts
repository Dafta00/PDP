import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStateDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

export class CreateSenatorialDistrictDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  stateId!: string;
}

export class CreateLgaDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  senatorialDistrictId!: string;
}

export class CreateWardDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  lgaId!: string;
}

export class CreatePollingUnitDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  wardId!: string;
}

export class RenameDto {
  @IsString()
  @MinLength(2)
  name!: string;
}
