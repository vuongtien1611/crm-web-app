import { IsOptional, IsString } from 'class-validator';

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  orderName?: string;

  @IsOptional()
  startDate?: string;

  @IsOptional()
  endDate?: string;
}
