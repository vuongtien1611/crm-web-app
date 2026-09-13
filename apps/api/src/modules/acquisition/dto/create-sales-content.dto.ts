import { IsString, IsNotEmpty, IsOptional, IsNumberString, IsUrl } from 'class-validator';

export class CreateSalesContentDto {
  @IsString()
  @IsNotEmpty()
  contentTitle!: string;

  @IsNumberString()
  @IsNotEmpty()
  creatorEmployeeId!: string;

  @IsNumberString()
  @IsOptional()
  platformId?: string;

  @IsNumberString()
  @IsOptional()
  channelId?: string;

  @IsNumberString()
  @IsOptional()
  campaignId?: string;

  @IsString()
  @IsOptional()
  url?: string;
}
