import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RequirementValueDto {
  @IsString()
  @IsNotEmpty()
  fieldKey!: string;

  @IsString()
  @IsOptional()
  valueText?: string;

  @IsOptional()
  valueJson?: any;
}

export class UpdateOrderItemRequirementsDto {
  @IsArray()
  @IsNotEmpty()
  requirements!: RequirementValueDto[];
}
