import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreatePayrollAdjustmentDto {
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  reason: string;
}
