import { IsNumberString, IsNotEmpty } from 'class-validator';

export class SetClosingSaleDto {
  @IsNumberString()
  @IsNotEmpty()
  closingSaleId!: string;
}
