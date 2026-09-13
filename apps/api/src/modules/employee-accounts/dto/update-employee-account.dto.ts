import { IsOptional, IsString, IsIn, MinLength } from 'class-validator';

export class UpdateEmployeeAccountDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'], { message: 'Trạng thái tài khoản phải là ACTIVE hoặc DISABLED' })
  accountStatus?: 'ACTIVE' | 'DISABLED';

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có tối thiểu 8 ký tự' })
  newPassword?: string;

  @IsOptional()
  resetRequestId?: string | number;
}
