import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class ConvertLeadToDealDto {
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsOptional()
  taxCode?: string;

  @IsString()
  @IsNotEmpty()
  contactName!: string;

  @IsString()
  @IsOptional()
  contactPhone?: string;

  @IsString()
  @IsOptional()
  contactEmail?: string;

  @IsString()
  @IsNotEmpty()
  dealName!: string;

  @IsNumber()
  @IsOptional()
  expectedValue?: number;
}
