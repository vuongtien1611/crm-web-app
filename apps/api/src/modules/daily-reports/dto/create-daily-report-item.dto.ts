import { IsNotEmpty, IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';

export class CreateDailyReportItemDto {
  @IsOptional()
  projectId?: string | number | null;

  @IsNotEmpty()
  @IsString()
  workTitle!: string;

  @IsNotEmpty()
  @IsString()
  workDetail!: string;

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
