import { IsString, IsNotEmpty } from 'class-validator';

export class MarkFailedDto {
  @IsString()
  @IsNotEmpty()
  failedReason!: string;
}
