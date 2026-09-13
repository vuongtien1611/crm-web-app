import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ProcessPayrollExpenseDto {
  @IsNotEmpty()
  @IsString()
  payroll_period_id!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
