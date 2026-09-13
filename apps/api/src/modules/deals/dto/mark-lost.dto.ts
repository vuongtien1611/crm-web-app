import { IsString, IsNotEmpty } from 'class-validator';

export class MarkLostDto {
  @IsString()
  @IsNotEmpty()
  lostReason!: string;
}
