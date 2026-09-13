import { IsString, IsNotEmpty, IsNumber, IsOptional, IsNumberString } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsNumber()
  @IsOptional()
  weight?: number;

  @IsNumberString()
  @IsOptional()
  assignedToEmployeeId?: string;

  @IsNumberString()
  @IsOptional()
  milestoneId?: string;
}
