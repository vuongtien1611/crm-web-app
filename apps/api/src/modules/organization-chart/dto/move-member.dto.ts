import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MoveMemberDto {
  @IsNotEmpty({ message: 'ID nhân viên là bắt buộc' })
  employeeId!: string | number;

  @IsNotEmpty({ message: 'ID nhóm đích là bắt buộc' })
  targetTeamId!: string | number;

  @IsOptional()
  @IsString()
  reason?: string;
}
