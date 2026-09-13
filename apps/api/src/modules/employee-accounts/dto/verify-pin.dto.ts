import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifyPinDto {
  @IsNotEmpty({ message: 'Vui lòng nhập mã PIN 6 chữ số' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Mã PIN phải bao gồm đúng 6 chữ số' })
  pin!: string;
}
