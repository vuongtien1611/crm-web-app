import { IsNumberString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';

export class CreateOrderItemDto {
  @IsNumberString()
  @IsNotEmpty()
  serviceId!: string;

  @IsNumberString()
  @IsNotEmpty()
  closingSaleId!: string;

  @IsNumberString()
  @IsOptional()
  dealId?: string;

  @IsNumber()
  @IsNotEmpty()
  originalPrice!: number;

  @IsNumber()
  @IsOptional()
  discountAmount?: number;

  @IsNumber()
  @IsOptional()
  vatAmount?: number;
}
