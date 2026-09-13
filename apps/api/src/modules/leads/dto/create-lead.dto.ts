import { IsString, IsNotEmpty, IsOptional, IsEmail, IsNumberString } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  // Attribution (Organic vs Manual)
  @IsNumberString()
  @IsOptional()
  platformId?: string;

  @IsNumberString()
  @IsOptional()
  channelId?: string;

  @IsNumberString()
  @IsOptional()
  campaignId?: string;

  @IsNumberString()
  @IsOptional()
  salesContentId?: string;

  @IsNumberString()
  @IsOptional()
  creatorEmployeeId?: string;

  @IsNumberString()
  @IsOptional()
  assignedSaleId?: string;

  @IsString()
  @IsOptional()
  landingPage?: string;

  @IsString()
  @IsOptional()
  externalId?: string;

  @IsString()
  @IsOptional()
  utmSource?: string;

  @IsString()
  @IsOptional()
  utmMedium?: string;

  @IsString()
  @IsOptional()
  utmCampaign?: string;
}
