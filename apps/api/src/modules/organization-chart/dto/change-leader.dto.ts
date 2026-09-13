import { IsNotEmpty } from 'class-validator';

export class ChangeLeaderDto {
  @IsNotEmpty({ message: 'ID nhóm là bắt buộc' })
  teamId!: string | number;

  @IsNotEmpty({ message: 'ID trưởng nhóm mới là bắt buộc' })
  newLeaderEmployeeId!: string | number;
}
