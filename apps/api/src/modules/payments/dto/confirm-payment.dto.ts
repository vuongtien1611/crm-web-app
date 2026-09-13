import { IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AllocationItemDto } from './create-payment.dto';

export class ConfirmPaymentDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationItemDto)
  allocations?: AllocationItemDto[];
}
