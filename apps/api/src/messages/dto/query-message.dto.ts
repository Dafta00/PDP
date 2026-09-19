import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryMessageDto {
  @IsOptional()
  @IsIn(['inbox', 'sent'])
  box?: 'inbox' | 'sent';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
