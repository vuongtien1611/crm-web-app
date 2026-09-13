import { IsNumberString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AssignLeadDto {
  @IsNumberString()
  @IsNotEmpty()
  toSaleId!: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
