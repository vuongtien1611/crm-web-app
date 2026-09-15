import { IsNumberString, IsOptional, IsString } from 'class-validator';

export class RecordAcceptanceDto {
  @IsOptional()
  @IsNumberString()
  customerContactId?: string;

  @IsOptional()
  @IsNumberString()
  contactId?: string;

  @IsOptional()
  @IsString()
  acceptedByName?: string;

  @IsOptional()
  @IsString()
  representativeName?: string;

  @IsOptional()
  @IsString()
  evidenceDocument?: string;

  @IsOptional()
  @IsString()
  acceptanceEvidenceUrl?: string;
}

