import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateWeeklyReportDto {
  @IsOptional()
  @IsString()
  summary_work_done?: string;

  @IsOptional()
  @IsString()
  summary_blockers?: string;

  @IsOptional()
  @IsString()
  summary_next_week?: string;

  @IsOptional()
  @IsString()
  leader_note?: string;

  @IsOptional()
  @IsString()
  @IsIn(['DRAFT', 'COMPLETED'])
  status?: 'DRAFT' | 'COMPLETED';
}
