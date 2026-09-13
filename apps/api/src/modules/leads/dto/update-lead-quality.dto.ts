import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum LeadQuality {
  UNCLASSIFIED = 'UNCLASSIFIED',
  POTENTIAL = 'POTENTIAL',
  NOT_POTENTIAL = 'NOT_POTENTIAL',
}

export class UpdateLeadQualityDto {
  @IsEnum(LeadQuality)
  @IsNotEmpty()
  quality!: LeadQuality;

  @IsString()
  @IsOptional()
  notPotentialReason?: string;
}
