import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsNotEmpty({ message: 'Vui lòng nhập tên đăng nhập, email hoặc mã nhân viên' })
  @IsString()
  @MaxLength(255)
  identifier!: string;
}
