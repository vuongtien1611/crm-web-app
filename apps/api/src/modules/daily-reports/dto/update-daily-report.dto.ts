import { IsOptional, IsString } from 'class-validator';

export class UpdateDailyReportDto {
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
