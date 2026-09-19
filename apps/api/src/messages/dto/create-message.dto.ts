import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  recipientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;

  // Set when this message is a reply — the new row still goes through the
  // same canCommunicateWith authorization check as any other send.
  @IsOptional()
  @IsString()
  parentMessageId?: string;
}
