import { PartialType } from '@nestjs/mapped-types';
import { IsEnum } from 'class-validator';
import { EventStatus } from '@prisma/client';
import { CreateEventDto } from './create-event.dto';

export class UpdateEventDto extends PartialType(CreateEventDto) {}

export class UpdateEventStatusDto {
  @IsEnum(EventStatus)
  status!: EventStatus;
}
