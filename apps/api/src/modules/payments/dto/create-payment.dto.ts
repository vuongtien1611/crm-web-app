import { IsNotEmpty, IsNumber, IsString, IsOptional, IsEnum, Min, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CASH = 'CASH',
  CREDIT_CARD = 'CREDIT_CARD',
  E_WALLET = 'E_WALLET',
}

export class AllocationItemDto {
  @IsNotEmpty()
  @IsString()
  installmentId: string;

  @IsNumber()
  @Min(0.01)
  grossAllocatedAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vatAllocatedAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  serviceAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  netEligibleAmount?: number;

  @IsOptional()
  @IsString()
  closingSaleId?: string;
}

export class CreatePaymentDto {
  @IsNumber()
  @Min(0.01)
  grossCashAmount: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  paymentCode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationItemDto)
  allocations?: AllocationItemDto[];
}
