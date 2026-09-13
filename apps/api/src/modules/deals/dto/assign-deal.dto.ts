import { IsNumberString, IsNotEmpty } from 'class-validator';

export class AssignDealDto {
  @IsNumberString()
  @IsNotEmpty()
  toSaleId!: string;
}
