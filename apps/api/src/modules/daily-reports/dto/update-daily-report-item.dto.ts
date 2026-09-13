import { IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';

export class UpdateDailyReportItemDto {
  @IsOptional()
  projectId?: string | number | null;

  @IsOptional()
  @IsString()
  workTitle?: string;

  @IsOptional()
  @IsString()
  workDetail?: string;

  @IsOptional()
  @IsString()
  link?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'])
  status?: 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
