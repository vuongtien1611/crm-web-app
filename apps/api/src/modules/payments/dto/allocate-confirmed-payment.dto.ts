import { Type } from 'class-transformer';
import { IsNumber, IsString, Min } from 'class-validator';

export class AllocateConfirmedPaymentDto {
  @IsString()
  installmentId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  grossAllocatedAmount!: number;
}
