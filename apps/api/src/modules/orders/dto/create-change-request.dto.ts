import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional } from 'class-validator';

export enum ChangeType {
  SCOPE_CHANGE = 'SCOPE_CHANGE',
  PRICE_CHANGE = 'PRICE_CHANGE',
  CANCELLATION = 'CANCELLATION',
}

export class CreateChangeRequestDto {
  @IsEnum(ChangeType)
  @IsNotEmpty()
  changeType!: ChangeType;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  @IsOptional()
  amountDelta?: number;

  @IsNumber()
  @IsOptional()
  daysDelta?: number;
}
