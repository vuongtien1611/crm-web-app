import { IsNotEmpty, IsNumber, IsString, IsOptional, IsEnum, Min } from 'class-validator';

export enum ExpenseSourceType {
  PAYROLL = 'PAYROLL',
  DIRECT_PURCHASE = 'DIRECT_PURCHASE',
  ADS = 'ADS',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
}

export class CreateExpenseDto {
  @IsNotEmpty()
  @IsString()
  category_id!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.01, { message: 'Expense amount must be greater than 0' })
  amount!: number;

  @IsNotEmpty()
  @IsString()
  expense_date!: string;

  @IsNotEmpty()
  @IsEnum(ExpenseSourceType)
  source_type!: ExpenseSourceType;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  approved_by_employee_id?: string;
}
