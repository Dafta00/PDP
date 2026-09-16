import { IsBoolean } from 'class-validator';

export class SetPermissionDto {
  @IsBoolean()
  grant!: boolean;
}
