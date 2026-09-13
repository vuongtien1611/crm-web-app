import { IsString, IsOptional, IsNumber, IsNumberString } from 'class-validator';

export class UpdateDealDto {
  @IsString()
  @IsOptional()
  dealName?: string;

  @IsNumber()
  @IsOptional()
  expectedValue?: number;

  @IsNumberString()
  @IsOptional()
  primaryContactId?: string;
}
