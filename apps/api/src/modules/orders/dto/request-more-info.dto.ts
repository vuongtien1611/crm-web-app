import { IsString, IsNotEmpty } from 'class-validator';

export class RequestMoreInfoDto {
  @IsString()
  @IsNotEmpty()
  note!: string;
}
