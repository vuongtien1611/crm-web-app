import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreatePlatformDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
