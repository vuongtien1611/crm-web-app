import { IsNotEmpty, IsString, IsOptional, Matches } from 'class-validator';

export class CreateDailyReportDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'report_date must be in YYYY-MM-DD format' })
  report_date!: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsString()
  support_needed?: string;

  @IsOptional()
  @IsString()
  next_plan?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  items?: any[];
}
