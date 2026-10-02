import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsBoolean,
} from 'class-validator';

export type ChangePositionType = 'PROMOTION' | 'DEMOTION' | 'TRANSFER';

export class ChangePositionDto {
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng chọn mã chức vụ mới' })
  positionCode!: string;

  @IsOptional()
  @IsString()
  roleCode?: string;

  @IsOptional()
  @IsIn(['PROMOTION', 'DEMOTION', 'TRANSFER'], {
    message: 'Loại quyết định phải là PROMOTION, DEMOTION hoặc TRANSFER',
  })
  actionType?: ChangePositionType;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsBoolean()
  updateTeamLeaderStatus?: boolean;
}
