import { IsNumberString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';

export enum AssignmentType {
  PRIMARY = 'PRIMARY',
  SUPPORT = 'SUPPORT',
}

export class AssignProjectDto {
  @IsNumberString()
  @IsNotEmpty()
  employeeId!: string;

  @IsEnum(AssignmentType)
  @IsNotEmpty()
  assignmentType!: AssignmentType;
}
