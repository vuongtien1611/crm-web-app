import { IsNotEmpty, IsString, IsDateString } from 'class-validator';

export class CreatePayrollPeriodDto {
  @IsNotEmpty()
  @IsString()
  periodKey: string;

  @IsNotEmpty()
  @IsDateString()
  startDate: string;

  @IsNotEmpty()
  @IsDateString()
  endDate: string;
}
