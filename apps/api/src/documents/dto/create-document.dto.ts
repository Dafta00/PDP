import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { DocumentCategory } from '@prisma/client';

export class CreateDocumentDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(DocumentCategory)
  category!: DocumentCategory;

  // Uploads are multipart/form-data, so this arrives as the literal string
  // "true"/"false" rather than a real boolean — validated as such and
  // parsed explicitly in the controller, rather than leaning on
  // class-transformer's implicit conversion (which treats any non-empty
  // string, including "false", as truthy).
  @IsOptional()
  @IsIn(['true', 'false'])
  restrictedToAdmins?: string;
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DocumentCategory)
  category?: DocumentCategory;

  // Sent as plain JSON (no multipart involved here), so a real boolean.
  @IsOptional()
  @IsBoolean()
  restrictedToAdmins?: boolean;
}
