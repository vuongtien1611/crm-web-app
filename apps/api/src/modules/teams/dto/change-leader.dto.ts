import { IsNotEmpty } from 'class-validator';

export class ChangeLeaderDto {
  @IsNotEmpty({ message: 'ID nhân viên lãnh đạo mới là bắt buộc' })
  newLeaderEmployeeId!: string | number;
}
