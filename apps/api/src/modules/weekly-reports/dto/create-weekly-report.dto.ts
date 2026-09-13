import { IsNotEmpty, IsString, IsOptional, Matches, IsIn } from 'class-validator';

export class CreateWeeklyReportDto {
  @IsOptional()
  team_id?: number | string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'week_start must be in YYYY-MM-DD format' })
  week_start!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'week_end must be in YYYY-MM-DD format' })
  week_end!: string;

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
