import { IsOptional, IsString } from 'class-validator';

export class QueryWeeklyReportDto {
  @IsOptional()
  team_id?: string | number;

  @IsOptional()
  @IsString()
  week_start?: string;

  @IsOptional()
  @IsString()
  week_end?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
