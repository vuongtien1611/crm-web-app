import { IsNumberString, IsNotEmpty, IsString } from 'class-validator';

export class RecordAcceptanceDto {
  @IsNumberString()
  @IsNotEmpty()
  customerContactId!: string;

  @IsString()
  @IsNotEmpty()
  acceptedByName!: string;

  @IsString()
  @IsNotEmpty()
  evidenceDocument!: string;
}
