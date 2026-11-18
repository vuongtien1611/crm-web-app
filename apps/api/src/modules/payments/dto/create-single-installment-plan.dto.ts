import { IsDateString, Matches } from 'class-validator';

export class CreateSingleInstallmentPlanDto {
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate!: string;
}
