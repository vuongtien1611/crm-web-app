import { IsNotEmpty, IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';

export enum TeamDepartment {
  SALES = 'SALES',
  DEV = 'DEV',
  SEO = 'SEO',
  OPERATION = 'OPERATION',
}

export class CreateTeamDto {
  @IsNotEmpty({ message: 'Tên nhóm làm việc là bắt buộc' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsNotEmpty({ message: 'Mã nhóm làm việc là bắt buộc' })
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsNotEmpty({ message: 'Phòng ban trực thuộc là bắt buộc' })
  @IsEnum(TeamDepartment, {
    message: 'Phòng ban phải là một trong các giá trị: SALES, DEV, SEO, OPERATION',
  })
  department!: TeamDepartment;

  @IsOptional()
  @IsString()
  description?: string;
}
