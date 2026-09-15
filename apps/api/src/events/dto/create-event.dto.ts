import { IsEnum, IsISO8601, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export enum EventTargetLevel {
  DISTRICT = 'DISTRICT',
  LGA = 'LGA',
  WARD = 'WARD',
  POLLING_UNIT = 'POLLING_UNIT',
}

export class CreateEventDto {
  @IsString()
  @MinLength(3)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  endTime!: string;

  @IsString()
  @MinLength(2)
  location!: string;

  @IsEnum(EventTargetLevel)
  targetLevel!: EventTargetLevel;

  @ValidateIf((dto) => dto.targetLevel !== EventTargetLevel.DISTRICT)
  @IsString()
  targetId?: string;
}
