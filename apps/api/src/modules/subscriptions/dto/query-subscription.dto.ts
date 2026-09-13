import { IsOptional, IsString, IsIn, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QuerySubscriptionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MONTH', 'QUARTER', 'YEAR', 'CUSTOM'])
  billing_interval?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
