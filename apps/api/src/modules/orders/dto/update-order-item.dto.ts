import { IsNumber, IsOptional, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UpdateOrderItemDto {
  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null ? String(value) : value))
  serviceId?: string | number;

  @IsOptional()
  @Transform(({ value }) => (value !== undefined && value !== null ? String(value) : value))
  closingSaleId?: string | number;

  @IsOptional()
  @IsNumber({}, { message: 'Đơn giá gốc phải là số' })
  @Min(1, { message: 'Đơn giá gốc phải lớn hơn 0' })
  @Type(() => Number)
  originalPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Số tiền giảm giá phải là số' })
  @Min(0, { message: 'Số tiền giảm giá không được âm' })
  @Type(() => Number)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vatAmount?: number;

  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;
}
