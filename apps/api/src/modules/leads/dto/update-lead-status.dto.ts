import { IsEnum, IsNotEmpty } from 'class-validator';

export enum LeadStatus {
  NEW = 'NEW',
  CALLED = 'CALLED',
  CONSULTED = 'CONSULTED',
  FOLLOWING = 'FOLLOWING',
  CONVERTED = 'CONVERTED',
  FAILED = 'FAILED',
}

export class UpdateLeadStatusDto {
  @IsEnum(LeadStatus)
  @IsNotEmpty()
  status!: LeadStatus;
}
