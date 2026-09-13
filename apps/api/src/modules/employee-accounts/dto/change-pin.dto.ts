import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class ChangePinDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã PIN hiện tại phải bao gồm đúng 6 chữ số' })
  currentPin?: string;

  @IsNotEmpty({ message: 'Vui lòng nhập mã PIN mới' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã PIN mới phải bao gồm đúng 6 chữ số' })
  newPin!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Xác nhận mã PIN phải bao gồm đúng 6 chữ số' })
  confirmPin?: string;
}
