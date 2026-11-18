import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateLeadInfoDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+() -]{8,20}$/)
  phone?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;
}
