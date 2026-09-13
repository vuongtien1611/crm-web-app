import {
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsBoolean,
} from 'class-validator';

export class CreateEmployeeAccountDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username can only contain letters, numbers, underscores, and dashes',
  })
  username!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString({ message: 'hireDate must be a string' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'hireDate is required and must be in YYYY-MM-DD format',
  })
  hireDate!: string;

  @IsString()
  positionCode!: string;

  @IsString()
  roleCode!: string;

  @IsString()
  department!: string;

  @IsOptional()
  teamId?: string | number;

  @IsOptional()
  @IsBoolean()
  isLeader?: boolean;
}

export interface CompatibilityRule {
  roles: string[];
  departments: string[];
}

export const CANONICAL_DEPARTMENTS = ['SALES', 'DEV', 'SEO', 'OPERATION'] as const;

export const COMPATIBILITY_MATRIX: Record<string, CompatibilityRule> = {
  BOSS: {
    roles: ['BOSS'],
    departments: ['EXECUTIVE', 'MANAGEMENT', 'OPERATION'],
  },
  ACCOUNTANT: {
    roles: ['ACCOUNTANT'],
    departments: ['ACCOUNTING', 'FINANCE', 'OPERATION'],
  },
  SALE: {
    roles: ['SALE'],
    departments: ['SALES'],
  },
  SALES_TEAM_LEADER: {
    roles: ['SALES_TEAM_LEADER'],
    departments: ['SALES'],
  },
  DEV: {
    roles: ['DEV'],
    departments: ['DEV', 'DEVELOPMENT', 'TECHNICAL'],
  },
  DEV_TEAM_LEADER: {
    roles: ['DEV_TEAM_LEADER'],
    departments: ['DEV', 'DEVELOPMENT', 'TECHNICAL'],
  },
  SEO: {
    roles: ['SEO'],
    departments: ['SEO', 'MARKETING'],
  },
  SEO_TEAM_LEADER: {
    roles: ['SEO_TEAM_LEADER'],
    departments: ['SEO', 'MARKETING'],
  },
};
