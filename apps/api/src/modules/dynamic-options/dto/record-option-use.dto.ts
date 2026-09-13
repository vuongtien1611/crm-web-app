import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RecordOptionUseDto {
  @IsNotEmpty({ message: 'fieldKey is required' })
  @IsString()
  @MaxLength(100)
  fieldKey!: string;

  @IsNotEmpty({ message: 'value is required' })
  @IsString()
  @MaxLength(255)
  value!: string;
}
