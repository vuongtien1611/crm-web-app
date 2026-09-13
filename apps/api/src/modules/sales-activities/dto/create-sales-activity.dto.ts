import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsNumberString } from 'class-validator';

export enum ActivityType {
  CALL = 'CALL',
  MEETING = 'MEETING',
  ZALO = 'ZALO',
  EMAIL = 'EMAIL',
  NOTE = 'NOTE',
  FOLLOW_UP = 'FOLLOW_UP',
  QUOTATION = 'QUOTATION',
  TASK = 'TASK',
}

export class CreateSalesActivityDto {
  @IsNumberString()
  @IsOptional()
  leadId?: string;

  @IsNumberString()
  @IsOptional()
  dealId?: string;

  @IsNumberString()
  @IsOptional()
  accountId?: string;

  @IsEnum(ActivityType)
  @IsNotEmpty()
  activityType!: ActivityType;

  @IsDateString()
  @IsOptional()
  occurredAt?: string;

  @IsDateString()
  @IsOptional()
  nextFollowUpAt?: string;

  @IsString()
  @IsOptional()
  resultNote?: string;
}
