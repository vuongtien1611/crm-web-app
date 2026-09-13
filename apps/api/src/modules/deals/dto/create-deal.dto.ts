import { IsString, IsNotEmpty, IsOptional, IsNumber, IsNumberString } from 'class-validator';

export class CreateDealDto {
  @IsNumberString()
  @IsNotEmpty()
  accountId!: string;

  @IsNumberString()
  @IsOptional()
  primaryContactId?: string;

  @IsNumberString()
  @IsOptional()
  leadId?: string;

  @IsNumberString()
  @IsNotEmpty()
  assignedSaleId!: string;

  @IsString()
  @IsNotEmpty()
  dealName!: string;

  @IsNumber()
  @IsOptional()
  expectedValue?: number;
}
