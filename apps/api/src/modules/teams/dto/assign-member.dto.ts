import { IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class AssignMemberDto {
  @IsNotEmpty({ message: 'ID nhân viên là bắt buộc' })
  employeeId!: string | number;

  @IsOptional()
  @IsBoolean()
  isLeader?: boolean;
}
