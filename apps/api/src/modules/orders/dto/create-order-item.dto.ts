import { IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateOrderItemDto {
  @IsNotEmpty({ message: 'Vui lòng chọn dịch vụ' })
  @Transform(({ value }) => (value !== undefined && value !== null ? String(value) : value))
  serviceId!: string | number;

  @IsNotEmpty({ message: 'Vui lòng chọn nhân viên chốt sale' })
  @Transform(({ value }) => (value !== undefined && value !== null ? String(value) : value))
  closingSaleId!: string | number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null ? String(value) : value))
  dealId?: string | number;

  @IsNumber({}, { message: 'Đơn giá gốc phải là số' })
  @Min(1, { message: 'Đơn giá gốc phải lớn hơn 0' })
  @Type(() => Number)
  originalPrice!: number;

  @IsNumber({}, { message: 'Số tiền giảm giá phải là số' })
  @Min(0, { message: 'Số tiền giảm giá không được âm' })
  @IsOptional()
  @Type(() => Number)
  discountAmount?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  vatAmount?: number;

  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;
}

