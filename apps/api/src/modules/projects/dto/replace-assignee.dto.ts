import { IsNumberString, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ReplaceAssigneeDto {
  @IsNumberString()
  @IsNotEmpty()
  oldEmployeeId!: string;

  @IsNumberString()
  @IsNotEmpty()
  newEmployeeId!: string;

  @IsString()
  @IsNotEmpty()
  replacementReason!: string;
}
