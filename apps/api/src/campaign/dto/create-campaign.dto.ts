import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  name!: string;

  @IsString()
  candidateName!: string;

  @IsOptional()
  @IsString()
  candidateTitle?: string;

  @IsOptional()
  @IsString()
  candidateBio?: string;

  @IsOptional()
  @IsString()
  candidatePhotoUrl?: string;

  @IsString()
  party!: string;

  @IsString()
  electionType!: string;

  @IsInt()
  @Min(2000)
  electionYear!: number;

  @IsString()
  stateId!: string;
}
