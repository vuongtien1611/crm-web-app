import { IsNotEmpty, IsOptional, IsString, IsIn, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateServiceDto {
  @IsNotEmpty({ message: 'Tên dịch vụ không được để trống' })
  @IsString({ message: 'Tên dịch vụ phải là chuỗi' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'Mã dịch vụ phải là chuỗi' })
  code?: string;

  @IsOptional()
  @IsIn(['PROJECT', 'RECURRING'], { message: 'Loại dịch vụ phải là PROJECT hoặc RECURRING' })
  serviceType?: 'PROJECT' | 'RECURRING';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Đơn giá mặc định phải là số' })
  @Min(0, { message: 'Đơn giá mặc định không được âm' })
  @Type(() => Number)
  defaultPrice?: number;
}
